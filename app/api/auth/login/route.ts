import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdminAuthError } from "@/lib/admin-auth-error";
import {
  createSession,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";
import { oid } from "@/lib/mongo-utils";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";
import { decryptSecret } from "@/lib/encryption";
import { hashRecoveryCode, verifyTotp } from "@/lib/totp";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(1024),
  orgId: z.string().optional(),
  code: z.string().trim().optional(),
  recoveryCode: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);

    const canonicalEmail = canonicalizeEmail(parsed.data.email);
    await Promise.all([
      consumeRateLimit("login-ip", requestIp(request), { limit: 20, windowMs: 15 * 60_000 }),
      consumeRateLimit("login-account", canonicalEmail, { limit: 8, windowMs: 15 * 60_000 }),
    ]);

    const user = await collections.users().findOne({ canonicalEmail });
    if (!user?.passwordHash || user.disabled || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return apiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }
    let mfaVerified = !user.mfaRequired;
    if (user.totpSecretCiphertext) {
      if (!parsed.data.code && !parsed.data.recoveryCode) {
        return NextResponse.json(
          { ok: false, mfa: { required: true, enrollmentRequired: false } },
          { status: 202 }
        );
      }
      let usedRecoveryHash: string | null = null;
      mfaVerified = parsed.data.code
        ? verifyTotp(decryptSecret(user.totpSecretCiphertext), parsed.data.code)
        : Boolean(
            (usedRecoveryHash = hashRecoveryCode(parsed.data.recoveryCode ?? "")) &&
            (user.recoveryCodeHashes ?? []).includes(usedRecoveryHash)
          );
      if (!mfaVerified) {
        return apiError(401, "INVALID_MFA_CODE", "The authenticator or recovery code is invalid");
      }
      if (usedRecoveryHash) {
        const consumed = await collections.users().updateOne(
          { _id: user._id, recoveryCodeHashes: usedRecoveryHash },
          { $pull: { recoveryCodeHashes: usedRecoveryHash }, $set: { updatedAt: new Date() } }
        );
        if (!consumed.modifiedCount) {
          return apiError(401, "RECOVERY_CODE_USED", "That recovery code has already been used");
        }
      }
    }

    const requestedOrgId = parsed.data.orgId ? oid(parsed.data.orgId) : null;
    const memberships = await collections
      .memberships()
      .find({
        userId: user._id,
        status: "ACTIVE",
        ...(requestedOrgId ? { orgId: requestedOrgId } : {}),
      })
      .sort({ createdAt: 1 })
      .toArray();
    if (!memberships.length) {
      return apiError(403, "NO_MEMBERSHIP", "This account does not belong to an organization");
    }

    const organizations = await collections
      .organizations()
      .find({
        _id: { $in: memberships.map((membership) => membership.orgId) },
        suspended: { $ne: true },
        status: { $nin: ["PROVISIONING", "SUSPENDED", "DELETING"] },
      })
      .toArray();
    const allowedOrgIds = new Set(organizations.map((organization) => organization._id.toHexString()));
    const membership = memberships.find((item) => allowedOrgIds.has(item.orgId.toHexString()));
    if (!membership) {
      return apiError(403, "ORGANIZATION_SUSPENDED", "No active organization is available for this account");
    }
    const authorized = await writeActiveTenantAudit(
      membership.orgId,
      {
        actor: user.email,
        action: "LOGIN",
        target: "session",
        metadata: { method: "password" },
        createdAt: new Date(),
      },
      async (databaseSession) => {
        const currentUser = await collections.users().findOne(
          {
            _id: user._id,
            canonicalEmail,
            passwordHash: user.passwordHash,
            disabled: { $ne: true },
          },
          { session: databaseSession }
        );
        const currentMembership = await collections.memberships().findOne(
          {
            _id: membership._id,
            userId: user._id,
            orgId: membership.orgId,
            status: "ACTIVE",
          },
          { session: databaseSession }
        );
        if (!currentUser || !currentMembership) {
          throw new AdminAuthError(
            "Login authorization changed. Sign in again.",
            403,
            "LOGIN_STATE_CHANGED"
          );
        }
        return { user: currentUser, membership: currentMembership };
      }
    );
    if (authorized.user.passwordHash && passwordNeedsRehash(authorized.user.passwordHash)) {
      const upgradedHash = await hashPassword(parsed.data.password);
      await collections.users().updateOne(
        { _id: authorized.user._id, passwordHash: authorized.user.passwordHash },
        { $set: { passwordHash: upgradedHash, updatedAt: new Date() } }
      );
    }
    await createSession({
      userId: authorized.user._id.toHexString(),
      membershipId: authorized.membership._id.toHexString(),
      orgId: authorized.membership.orgId.toHexString(),
      email: authorized.user.email,
      name: authorized.user.name,
      role: authorized.membership.role,
    }, {
      authMethod: "PASSWORD",
      mfaVerified,
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      ok: true,
      organizationId: authorized.membership.orgId.toHexString(),
      organizations: organizations.map((organization) => ({
        id: organization._id.toHexString(),
        name: organization.name,
      })),
      mustChangePassword: Boolean(authorized.user.mustChangePassword),
      mfaEnrollmentRequired: Boolean(authorized.user.mfaRequired && !authorized.user.totpSecretCiphertext),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many login attempts. Try again later.");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}
