import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import {
  verifyPassword,
  createPlatformSession,
  hashPassword,
  passwordNeedsRehash,
} from "@/lib/auth";
import { toId } from "@/lib/mongo-utils";
import { z } from "zod";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { canonicalizeEmail } from "@/lib/identity";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpUri,
  verifyTotp,
} from "@/lib/totp";
import {
  normalizedPlatformRole,
  platformAdminIsActive,
  writePlatformAudit,
} from "@/lib/platform-policy";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  code: z.string().trim().optional(),
  recoveryCode: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const email = canonicalizeEmail(parsed.data.email);
    await Promise.all([
      consumeRateLimit("platform-login-ip", requestIp(req), { limit: 10, windowMs: 15 * 60_000 }),
      consumeRateLimit("platform-login-account", email, { limit: 6, windowMs: 15 * 60_000 }),
    ]);
    const adminDoc = await collections.platformAdmins().findOne({
      $or: [{ canonicalEmail: email }, { email }],
    });
    if (!adminDoc || !(await verifyPassword(parsed.data.password, adminDoc.passwordHash))) {
      if (adminDoc) {
        await writePlatformAudit({
          actorId: adminDoc._id,
          actorEmail: adminDoc.email,
          actorRole: normalizedPlatformRole(adminDoc),
          action: "PLATFORM_LOGIN_FAILED",
          targetType: "platformAdmin",
          targetId: adminDoc._id.toHexString(),
          metadata: { phase: "password" },
        });
      }
      return apiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }
    if (!platformAdminIsActive(adminDoc)) {
      return apiError(403, "ACCOUNT_DISABLED", "This platform account is disabled");
    }

    const role = normalizedPlatformRole(adminDoc);
    let recoveryCodes: string[] | undefined;
    if (!adminDoc.totpSecretCiphertext) {
      let secret: string;
      let pendingCiphertext = adminDoc.pendingTotpSecretCiphertext ?? null;
      if (adminDoc.pendingTotpSecretCiphertext) {
        secret = decryptSecret(adminDoc.pendingTotpSecretCiphertext);
      } else {
        secret = generateTotpSecret();
        pendingCiphertext = encryptSecret(secret);
        await collections.platformAdmins().updateOne(
          { _id: adminDoc._id },
          {
            $set: {
              canonicalEmail: email,
              pendingTotpSecretCiphertext: pendingCiphertext,
              updatedAt: new Date(),
            },
          }
        );
      }
      if (!parsed.data.code) {
        return NextResponse.json(
          {
            ok: false,
            mfa: {
              required: true,
              enrollmentRequired: true,
              secret,
              uri: totpUri(secret, email),
            },
          },
          { status: 202 }
        );
      }
      if (!verifyTotp(secret, parsed.data.code)) {
        await writePlatformAudit({
          actorId: adminDoc._id,
          actorEmail: adminDoc.email,
          actorRole: role,
          action: "PLATFORM_MFA_FAILED",
          targetType: "platformAdmin",
          targetId: adminDoc._id.toHexString(),
          metadata: { phase: "enrollment" },
        });
        return apiError(401, "INVALID_MFA_CODE", "The authenticator code is invalid");
      }
      recoveryCodes = generateRecoveryCodes();
      const now = new Date();
      const enrollment = await collections.platformAdmins().updateOne(
        {
          _id: adminDoc._id,
          $or: [
            { totpSecretCiphertext: null },
            { totpSecretCiphertext: { $exists: false } },
          ],
          pendingTotpSecretCiphertext: pendingCiphertext,
        },
        {
          $set: {
            canonicalEmail: email,
            totpSecretCiphertext: encryptSecret(secret),
            pendingTotpSecretCiphertext: null,
            recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
            mfaEnrolledAt: now,
            updatedAt: now,
          },
        }
      );
      if (!enrollment.modifiedCount) {
        return apiError(
          409,
          "MFA_STATE_CHANGED",
          "Authenticator enrollment changed in another session. Sign in again."
        );
      }
      await writePlatformAudit({
        actorId: adminDoc._id,
        actorEmail: adminDoc.email,
        actorRole: role,
        action: "PLATFORM_MFA_ENROLLED",
        targetType: "platformAdmin",
        targetId: adminDoc._id.toHexString(),
      });
    } else {
      if (!parsed.data.code && !parsed.data.recoveryCode) {
        return NextResponse.json(
          { ok: false, mfa: { required: true, enrollmentRequired: false } },
          { status: 202 }
        );
      }
      let mfaValid = false;
      let usedRecoveryHash: string | null = null;
      if (parsed.data.code) {
        mfaValid = verifyTotp(
          decryptSecret(adminDoc.totpSecretCiphertext),
          parsed.data.code
        );
      } else if (parsed.data.recoveryCode) {
        usedRecoveryHash = hashRecoveryCode(parsed.data.recoveryCode);
        mfaValid = (adminDoc.recoveryCodeHashes ?? []).includes(usedRecoveryHash);
      }
      if (!mfaValid) {
        await writePlatformAudit({
          actorId: adminDoc._id,
          actorEmail: adminDoc.email,
          actorRole: role,
          action: "PLATFORM_MFA_FAILED",
          targetType: "platformAdmin",
          targetId: adminDoc._id.toHexString(),
          metadata: { phase: "login" },
        });
        return apiError(401, "INVALID_MFA_CODE", "The authenticator or recovery code is invalid");
      }
      if (usedRecoveryHash) {
        const consumed = await collections.platformAdmins().updateOne(
          { _id: adminDoc._id, recoveryCodeHashes: usedRecoveryHash },
          { $pull: { recoveryCodeHashes: usedRecoveryHash }, $set: { updatedAt: new Date() } }
        );
        if (!consumed.modifiedCount) {
          return apiError(
            401,
            "RECOVERY_CODE_USED",
            "That recovery code has already been used"
          );
        }
        await writePlatformAudit({
          actorId: adminDoc._id,
          actorEmail: adminDoc.email,
          actorRole: role,
          action: "PLATFORM_RECOVERY_CODE_USED",
          targetType: "platformAdmin",
          targetId: adminDoc._id.toHexString(),
        });
      }
    }

    const admin = toId(adminDoc);
    const sessionVersion = adminDoc.sessionVersion ?? 1;
    const upgradedHash = passwordNeedsRehash(adminDoc.passwordHash)
      ? await hashPassword(parsed.data.password)
      : null;
    await collections.platformAdmins().updateOne(
      { _id: adminDoc._id },
      {
        $set: {
          lastLoginAt: new Date(),
          canonicalEmail: email,
          updatedAt: new Date(),
          ...(upgradedHash ? { passwordHash: upgradedHash } : {}),
        },
      }
    );
    await createPlatformSession({
      platformAdminId: admin.id,
      email,
      name: admin.name,
      role,
      sessionVersion,
      mfaVerified: true,
    }, {
      authMethod: "PASSWORD",
      ipAddress: requestIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    await writePlatformAudit({
      actorId: adminDoc._id,
      actorEmail: adminDoc.email,
      actorRole: role,
      action: "PLATFORM_LOGIN_SUCCEEDED",
      targetType: "platformAdmin",
      targetId: admin.id,
      metadata: { recoveryCodeUsed: Boolean(parsed.data.recoveryCode) },
    });
    return NextResponse.json({ ok: true, ...(recoveryCodes ? { recoveryCodes } : {}) });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many platform login attempts");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}
