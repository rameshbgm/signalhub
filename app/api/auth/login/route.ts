import { NextRequest, NextResponse } from "next/server";
import { sql } from "kysely";
import { z } from "zod";
import { AdminAuthError } from "@/lib/admin-auth-error";
import {
  createSession,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { canonicalizeUsername } from "@/lib/identity";
import { database } from "@/lib/postgres/client";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";
import { decryptSecret } from "@/lib/encryption";
import { hashRecoveryCode, verifyTotp } from "@/lib/totp";

const databaseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const schema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(1024),
  orgId: z.string().regex(databaseIdPattern).optional(),
  code: z.string().trim().optional(),
  recoveryCode: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);

    const canonicalUsername = canonicalizeUsername(parsed.data.username);
    await Promise.all([
      consumeRateLimit("login-ip", requestIp(request), { limit: 20, windowMs: 15 * 60_000 }),
      consumeRateLimit("login-account", canonicalUsername, { limit: 8, windowMs: 15 * 60_000 }),
    ]);

    const user = await database
      .selectFrom("users")
      .selectAll()
      .where("canonicalUsername", "=", canonicalUsername)
      .executeTakeFirst();
    if (!user?.passwordHash || user.disabled || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return apiError(401, "INVALID_CREDENTIALS", "Invalid User ID or password");
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
            user.recoveryCodeHashes.includes(usedRecoveryHash)
          );
      if (!mfaVerified) {
        return apiError(401, "INVALID_MFA_CODE", "The authenticator or recovery code is invalid");
      }
      if (usedRecoveryHash) {
        const consumed = await database
          .updateTable("users")
          .set({
            recoveryCodeHashes: sql<string[]>`array_remove(recovery_code_hashes, ${usedRecoveryHash})`,
            updatedAt: new Date(),
          })
          .where("id", "=", user.id)
          .where(sql<boolean>`${usedRecoveryHash} = any(recovery_code_hashes)`)
          .returning("id")
          .executeTakeFirst();
        if (!consumed) {
          return apiError(401, "RECOVERY_CODE_USED", "That recovery code has already been used");
        }
      }
    }

    const memberships = await database
      .selectFrom("memberships")
      .selectAll()
      .where("userId", "=", user.id)
      .where("status", "=", "ACTIVE")
      .orderBy("createdAt", "asc")
      .execute();
    if (!memberships.length) {
      return apiError(403, "NO_MEMBERSHIP", "This account does not belong to an organization");
    }

    const globalAdminMembership = memberships.find((item) => item.role === "ADMIN");
    let organizationQuery = database
      .selectFrom("organizations")
      .selectAll()
      .where("suspended", "=", false)
      .where("status", "=", "ACTIVE");
    if (!globalAdminMembership) {
      organizationQuery = organizationQuery.where(
        "id",
        "in",
        memberships.map((membership) => membership.orgId)
      );
    }
    const organizations = await organizationQuery.orderBy("createdAt", "asc").execute();
    const targetOrganization = parsed.data.orgId
      ? organizations.find((organization) => organization.id === parsed.data.orgId)
      : organizations.find((organization) => globalAdminMembership?.orgId === organization.id) ?? organizations[0];
    const membership = globalAdminMembership ?? memberships.find(
      (item) => targetOrganization && item.orgId === targetOrganization.id
    );
    if (!membership || !targetOrganization) {
      return apiError(403, "ORGANIZATION_SUSPENDED", "No active organization is available for this account");
    }

    const authorized = await writeActiveTenantAudit(
      targetOrganization.id,
      {
        actor: user.username,
        action: "LOGIN",
        target: "session",
        metadata: { method: "password" },
        createdAt: new Date(),
      },
      async (transaction) => {
        const currentUser = await transaction
          .selectFrom("users")
          .selectAll()
          .where("id", "=", user.id)
          .where("canonicalUsername", "=", canonicalUsername)
          .where("passwordHash", "=", user.passwordHash)
          .where("disabled", "=", false)
          .executeTakeFirst();
        const currentMembership = await transaction
          .selectFrom("memberships")
          .selectAll()
          .where("id", "=", membership.id)
          .where("userId", "=", user.id)
          .where("status", "=", "ACTIVE")
          .executeTakeFirst();
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
      await database
        .updateTable("users")
        .set({ passwordHash: upgradedHash, updatedAt: new Date() })
        .where("id", "=", authorized.user.id)
        .where("passwordHash", "=", authorized.user.passwordHash)
        .execute();
    }
    await createSession({
      userId: authorized.user.id,
      membershipId: authorized.membership.id,
      orgId: targetOrganization.id,
      username: authorized.user.username,
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
      organizationId: targetOrganization.id,
      organizations: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
      })),
      mustChangePassword: authorized.user.mustChangePassword,
      mustCompleteProfile: authorized.user.mustCompleteProfile,
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
