import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { canonicalizeEmail, canonicalizeUsername } from "@/lib/identity";
import { logger, errorFields } from "@/lib/logger";
import { newPasswordError } from "@/lib/password-policy";
import { writePlatformAudit } from "@/lib/platform-policy";
import { database, withDatabaseTransaction, type DatabaseExecutor } from "@/lib/postgres/client";
import { generateSecret, hashSecret } from "@/lib/secrets";
import { smtpConfigured, smtpTransport } from "@/lib/smtp";

export const PASSWORD_RESET_TTL_MINUTES = 30;

export class PasswordResetError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Self-service reset needs outbound email and a trusted public URL for the link. */
export async function passwordResetByEmailAvailable() {
  return Boolean(process.env.NEXT_PUBLIC_APP_URL) && await smtpConfigured().catch(() => false);
}

async function usersForIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return [];
  const query = database.selectFrom("users")
    .select(["id", "username", "name", "email", "passwordHash", "disabled"]);
  const rows = value.includes("@")
    ? await query.where("canonicalEmail", "=", canonicalizeEmail(value)).limit(5).execute()
    : await query.where("canonicalUsername", "=", canonicalizeUsername(value)).limit(1).execute();
  // Single sign-on accounts have no local password, and disabled accounts stay disabled.
  return rows.filter((user) => user.email && user.passwordHash && !user.disabled);
}

/**
 * Emails a one-time reset link to the account(s) matching a User ID or email.
 * Callers respond identically whether or not anything matched, and run this
 * after the response so timing does not reveal accounts either.
 */
export async function requestPasswordReset(identifier: string, requestedIp: string | null) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  // The link must use the configured URL, never the request's Host header,
  // or a forged Host could send victims a link to someone else's server.
  if (!appUrl) return;
  try {
    for (const user of await usersForIdentifier(identifier)) {
      const { token, hash } = generateSecret("shpr_");
      await withDatabaseTransaction(async (transaction) => {
        // Only the newest link works.
        await transaction.deleteFrom("passwordResetTokens").where("userId", "=", user.id).where("usedAt", "is", null).execute();
        await transaction.insertInto("passwordResetTokens").values({
          userId: user.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
          requestedIp,
        }).execute();
      });
      const smtp = await smtpTransport();
      const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await smtp.transporter.sendMail({
        from: smtp.from,
        to: user.email,
        subject: "Reset your SignalHub password",
        text: [
          `Hello ${user.name || user.username},`,
          "",
          `Someone asked to reset the password for the SignalHub account "${user.username}".`,
          `To choose a new password, open this link within ${PASSWORD_RESET_TTL_MINUTES} minutes:`,
          "",
          link,
          "",
          "If you did not ask for this, ignore this email; your password stays the same.",
        ].join("\n"),
      });
      await writePlatformAudit({
        actorId: user.id, actorEmail: user.email, actorRole: "SYSTEM",
        action: "USER_PASSWORD_RESET_REQUESTED", targetType: "user", targetId: user.id,
        metadata: { requestedIp },
      });
    }
  } catch (error) {
    logger.error({ ...errorFields(error) }, "Password reset email failed");
  }
}

async function findUsableToken(token: string, executor: DatabaseExecutor = database) {
  if (!token.startsWith("shpr_")) return null;
  return executor.selectFrom("passwordResetTokens")
    .innerJoin("users", "users.id", "passwordResetTokens.userId")
    .select([
      "passwordResetTokens.id as tokenId", "users.id as userId", "users.username", "users.name",
      "users.email", "users.passwordHash", "users.disabled",
    ])
    .where("passwordResetTokens.tokenHash", "=", hashSecret(token))
    .where("passwordResetTokens.usedAt", "is", null)
    .where("passwordResetTokens.expiresAt", ">", new Date())
    .executeTakeFirst();
}

/** For the reset page: whether the link still works, and whose account it is. */
export async function describeResetToken(token: string) {
  const row = await findUsableToken(token);
  return row && !row.disabled ? { username: row.username } : null;
}

/** Sets the new password, burns the token and signs the account out everywhere. */
export async function resetPasswordWithToken(token: string, newPassword: string) {
  const row = await findUsableToken(token);
  if (!row || row.disabled) {
    throw new PasswordResetError("RESET_LINK_INVALID", "This reset link is invalid or has expired. Request a new one.");
  }
  const policy = newPasswordError(newPassword, [row.username, row.name, row.email ?? ""]);
  if (policy) throw new PasswordResetError("PASSWORD_POLICY_FAILED", policy);
  if (row.passwordHash && await verifyPassword(newPassword, row.passwordHash)) {
    throw new PasswordResetError("PASSWORD_REUSED", "Choose a different password than your current one.");
  }
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await withDatabaseTransaction(async (transaction) => {
    const burned = await transaction.updateTable("passwordResetTokens").set({ usedAt: now })
      .where("id", "=", row.tokenId).where("usedAt", "is", null).returning("id").executeTakeFirst();
    if (!burned) throw new PasswordResetError("RESET_LINK_INVALID", "This reset link has already been used.");
    await transaction.updateTable("users").set({ passwordHash, mustChangePassword: false, updatedAt: now })
      .where("id", "=", row.userId).execute();
    await transaction.updateTable("authSessions").set({ revokedAt: now, revokedReason: "password-reset" })
      .where("userId", "=", row.userId).where("revokedAt", "is", null).execute();
    await writePlatformAudit({
      actorId: row.userId, actorEmail: row.email ?? row.username, actorRole: "SYSTEM",
      action: "USER_PASSWORD_RESET", targetType: "user", targetId: row.userId,
      metadata: { method: "email-link" },
    }, { executor: transaction });
  });
  return { username: row.username };
}

/**
 * Operator recovery (`signalhubctl reset-password`): sets a temporary password
 * that must be changed at sign-in and signs the account out everywhere.
 * `clearMfa` removes the authenticator for someone who lost their device.
 */
export async function operatorResetPassword(identifier: string, options: { password?: string; clearMfa: boolean }) {
  const value = identifier.trim();
  const user = await database.selectFrom("users").select(["id", "username", "email", "disabled"])
    .where(value.includes("@") ? "canonicalEmail" : "canonicalUsername", "=", value.includes("@") ? canonicalizeEmail(value) : canonicalizeUsername(value))
    .executeTakeFirst();
  if (!user) throw new PasswordResetError("USER_NOT_FOUND", `No user "${value}".`);
  const password = options.password || randomBytes(15).toString("base64url");
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await withDatabaseTransaction(async (transaction) => {
    await transaction.updateTable("users").set({
      passwordHash,
      mustChangePassword: true,
      updatedAt: now,
      ...(options.clearMfa ? {
        totpSecretCiphertext: null, pendingTotpSecretCiphertext: null, recoveryCodeHashes: [],
        twoFactorEnabled: false, mfaEnrolledAt: null,
      } : {}),
    }).where("id", "=", user.id).execute();
    await transaction.updateTable("authSessions").set({ revokedAt: now, revokedReason: "operator-password-reset" })
      .where("userId", "=", user.id).where("revokedAt", "is", null).execute();
    await transaction.deleteFrom("passwordResetTokens").where("userId", "=", user.id).execute();
    await writePlatformAudit({
      actorEmail: "signalhubctl", actorRole: "SYSTEM",
      action: "USER_PASSWORD_RESET_BY_OPERATOR", targetType: "user", targetId: user.id,
      metadata: { clearMfa: options.clearMfa },
    }, { executor: transaction });
  });
  return { username: user.username, password, generated: !options.password, disabled: user.disabled };
}
