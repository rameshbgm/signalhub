import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, destroySession, verifyPassword } from "@/lib/auth";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { oid } from "@/lib/mongo-utils";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpUri,
  verifyTotp,
} from "@/lib/totp";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("confirm"), code: z.string().trim().length(6) }),
  z.object({
    action: z.literal("disable"),
    password: z.string().min(1).max(1024),
    code: z.string().trim().length(6),
  }),
]);

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return apiError(401, "UNAUTHENTICATED", "Sign in first");
    const user = await collections.users().findOne({ _id: oid(session.userId) });
    if (!user || user.disabled) return apiError(401, "SESSION_REVOKED", "Session is no longer authorized");
    return NextResponse.json({
      enrolled: Boolean(user.totpSecretCiphertext),
      required: Boolean(user.mfaRequired),
      enrolledAt: user.mfaEnrolledAt ?? null,
      recoveryCodesRemaining: user.recoveryCodeHashes?.length ?? 0,
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return apiError(401, "UNAUTHENTICATED", "Sign in first");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const user = await collections.users().findOne({
      _id: oid(session.userId),
      disabled: { $ne: true },
    });
    if (!user) return apiError(401, "SESSION_REVOKED", "Session is no longer authorized");

    if (parsed.data.action === "start") {
      if (user.totpSecretCiphertext) {
        return apiError(409, "MFA_ALREADY_ENROLLED", "Multi-factor authentication is already enabled");
      }
      const secret = user.pendingTotpSecretCiphertext
        ? decryptSecret(user.pendingTotpSecretCiphertext)
        : generateTotpSecret();
      if (!user.pendingTotpSecretCiphertext) {
        await collections.users().updateOne(
          { _id: user._id, totpSecretCiphertext: { $in: [null, undefined] } },
          { $set: { pendingTotpSecretCiphertext: encryptSecret(secret), updatedAt: new Date() } }
        );
      }
      return NextResponse.json({ secret, uri: totpUri(secret, user.email) });
    }

    if (parsed.data.action === "confirm") {
      if (!user.pendingTotpSecretCiphertext) {
        return apiError(409, "MFA_ENROLLMENT_NOT_STARTED", "Start enrollment first");
      }
      const secret = decryptSecret(user.pendingTotpSecretCiphertext);
      if (!verifyTotp(secret, parsed.data.code)) {
        return apiError(401, "INVALID_MFA_CODE", "The authenticator code is invalid");
      }
      const recoveryCodes = generateRecoveryCodes();
      const now = new Date();
      await writeActiveTenantAudit(
        oid(session.orgId),
        {
          actor: user.email,
          action: "MFA_ENROLLED",
          target: user._id.toHexString(),
          createdAt: now,
        },
        async (databaseSession) => {
          const changed = await collections.users().updateOne(
            { _id: user._id, pendingTotpSecretCiphertext: user.pendingTotpSecretCiphertext },
            {
              $set: {
                totpSecretCiphertext: encryptSecret(secret),
                pendingTotpSecretCiphertext: null,
                recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
                mfaEnrolledAt: now,
                updatedAt: now,
              },
            },
            { session: databaseSession }
          );
          if (!changed.modifiedCount) throw new Error("MFA enrollment changed in another session");
        }
      );
      await destroySession();
      return NextResponse.json({ ok: true, recoveryCodes, signInRequired: true });
    }

    if (
      !user.passwordHash ||
      !(await verifyPassword(parsed.data.password, user.passwordHash)) ||
      !user.totpSecretCiphertext ||
      !verifyTotp(decryptSecret(user.totpSecretCiphertext), parsed.data.code)
    ) {
      return apiError(401, "MFA_DISABLE_VERIFICATION_FAILED", "Password or authenticator code is invalid");
    }
    if (user.mfaRequired) {
      return apiError(409, "MFA_REQUIRED_BY_POLICY", "Your organization requires multi-factor authentication");
    }
    await collections.users().updateOne(
      { _id: user._id },
      {
        $set: {
          totpSecretCiphertext: null,
          pendingTotpSecretCiphertext: null,
          recoveryCodeHashes: [],
          mfaEnrolledAt: null,
          updatedAt: new Date(),
        },
      }
    );
    await collections.authSessions().updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: "mfa-disabled" } }
    );
    await destroySession();
    return NextResponse.json({ ok: true, signInRequired: true });
  } catch (error) {
    return routeError(error);
  }
}
