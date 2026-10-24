import { auditMfa } from "@/lib/mfa/audit";
import {
  afterFailedAttempt, canAddDevice, canDeleteDevice, isLocked, lockoutMessage, looksLikeRecoveryCode,
  PENDING_DEVICE_TTL_MS, RECOVERY_CODE_COUNT, REVEAL_EMAIL_LIMIT, REVEAL_TTL_MS, stepUpIsFresh,
} from "@/lib/mfa/policy";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { database, withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/lib/postgres/client";
import { generateSecret, hashSecret } from "@/lib/secrets";
import {
  consumeDeviceStep, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, mfaHmac,
  recoveryCodeLookupHashes, totpStep, totpUri,
} from "@/lib/totp";
import { challengeTtlMs, trustedDeviceExpiry } from "@/lib/mfa/policy";

/** An expected, user-facing failure. `code` is stable for clients; `message` is safe to show. */
export class MfaError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}

type Person = { id: string; email: string };
type ChangeAudit = { admin?: Person; reason?: string };

/** Serialises every change to one user's devices: the 2-cap and 1-minimum are checked under this lock. */
export async function lockUser(transaction: DatabaseTransaction, userId: string) {
  return transaction.selectFrom("users")
    .select(["id", "email", "name", "username", "disabled", "mfaFailedAttempts", "mfaLockedUntil"])
    .where("id", "=", userId).forUpdate().executeTakeFirstOrThrow();
}

async function activeCount(executor: DatabaseExecutor, userId: string) {
  const row = await executor.selectFrom("mfaDevices").select((eb) => eb.fn.countAll<string>().as("count"))
    .where("userId", "=", userId).where("status", "=", "ACTIVE").executeTakeFirstOrThrow();
  return Number(row.count);
}

export async function revokeTrustedDevices(executor: DatabaseExecutor, userId: string) {
  await executor.updateTable("mfaTrustedDevices").set({ revokedAt: new Date() })
    .where("userId", "=", userId).where("revokedAt", "is", null).execute();
}

export async function revokeAllSessions(executor: DatabaseExecutor, userId: string, reason: string) {
  await executor.updateTable("authSessions").set({ revokedAt: new Date(), revokedReason: reason })
    .where("userId", "=", userId).where("revokedAt", "is", null).execute();
}

/** When MFA is switched on, every other signed-in session was created without a code, so they all end. */
export async function revokeSessionsExcept(sessionId: string | undefined, reason: string) {
  let query = database.updateTable("authSessions").set({ revokedAt: new Date(), revokedReason: reason }).where("revokedAt", "is", null);
  if (sessionId) query = query.where("id", "!=", sessionId);
  await query.execute();
}

export async function mfaStatus(userId: string, executor: DatabaseExecutor = database) {
  const [devices, codes, user] = await Promise.all([
    executor.selectFrom("mfaDevices").select(["id", "name", "type", "createdAt", "lastUsedAt"])
      .where("userId", "=", userId).where("status", "=", "ACTIVE").orderBy("createdAt").execute(),
    executor.selectFrom("mfaRecoveryCodes").select((eb) => eb.fn.countAll<string>().as("count"))
      .where("userId", "=", userId).where("usedAt", "is", null).executeTakeFirstOrThrow(),
    executor.selectFrom("users").select(["mfaLockedUntil", "mfaReenrollRequired"]).where("id", "=", userId).executeTakeFirstOrThrow(),
  ]);
  return {
    devices,
    recoveryCodesRemaining: Number(codes.count),
    lockedUntil: user.mfaLockedUntil,
    reenrollRequired: user.mfaReenrollRequired,
  };
}

// ---- Enrollment ------------------------------------------------------------

/** A new, never-reused secret for a new device. Starting again replaces an unfinished one. */
export async function startDevice(user: Person, now = new Date(), audit: ChangeAudit = {}) {
  return withDatabaseTransaction(async (transaction) => {
    await lockUser(transaction, user.id);
    const abandoned = await transaction.deleteFrom("mfaDevices").where("userId", "=", user.id).where("status", "=", "PENDING")
      .returning("id").execute();
    const count = await activeCount(transaction, user.id);
    if (!canAddDevice(count)) throw new MfaError("MFA_DEVICE_LIMIT", "You already have two devices. Remove one before adding another.", 409);
    const secret = generateTotpSecret();
    const device = await transaction.insertInto("mfaDevices").values({
      userId: user.id,
      name: count === 0 ? "Authenticator" : "Second authenticator",
      secretCiphertext: encryptSecret(secret),
      secretHash: mfaHmac(secret),
      status: "PENDING",
      pendingExpiresAt: new Date(now.getTime() + PENDING_DEVICE_TTL_MS),
    }).returning("id").executeTakeFirstOrThrow();
    await auditMfa("MFA_ENROLLMENT_STARTED", { subject: user, ...audit, executor: transaction });
    if (abandoned.length) await auditMfa("MFA_ENROLLMENT_ABANDONED", { subject: user, ...audit, executor: transaction, metadata: { restarted: true } });
    return { deviceId: device.id, secret, uri: totpUri(secret, user.email), firstDevice: count === 0 };
  });
}

function recoveryRows(userId: string, codes: string[]) {
  return codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) }));
}

async function replaceRecoveryCodes(transaction: DatabaseTransaction, userId: string, now: Date) {
  const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  await transaction.deleteFrom("mfaRecoveryCodes").where("userId", "=", userId).execute();
  await transaction.insertInto("mfaRecoveryCodes").values(recoveryRows(userId, codes)).execute();
  await transaction.insertInto("mfaRecoveryReveals")
    .values({ userId, ciphertext: encryptSecret(codes.join(" ")), expiresAt: new Date(now.getTime() + REVEAL_TTL_MS) })
    .onConflict((conflict) => conflict.column("userId").doUpdateSet({
      ciphertext: encryptSecret(codes.join(" ")), expiresAt: new Date(now.getTime() + REVEAL_TTL_MS), emailsSent: 0,
    })).execute();
  return codes;
}

/** Activates the pending device when the typed code proves the phone has the secret. */
export async function confirmDevice(user: Person, code: string, now = new Date(), audit: ChangeAudit = {}) {
  return withDatabaseTransaction(async (transaction) => {
    await lockUser(transaction, user.id);
    const pending = await transaction.selectFrom("mfaDevices").selectAll()
      .where("userId", "=", user.id).where("status", "=", "PENDING").executeTakeFirst();
    if (!pending || (pending.pendingExpiresAt && pending.pendingExpiresAt.getTime() < now.getTime())) {
      if (pending) {
        await transaction.deleteFrom("mfaDevices").where("id", "=", pending.id).execute();
        await auditMfa("MFA_ENROLLMENT_ABANDONED", { subject: user, ...audit, executor: transaction, metadata: { expired: true } });
      }
      throw new MfaError("MFA_ENROLLMENT_EXPIRED", "That setup expired. Start again to get a new QR code.", 409);
    }
    const count = await activeCount(transaction, user.id);
    if (!canAddDevice(count)) throw new MfaError("MFA_DEVICE_LIMIT", "You already have two devices. Remove one before adding another.", 409);
    const step = totpStep(decryptSecret(pending.secretCiphertext), code, now.getTime());
    if (step === null) throw new MfaError("INVALID_MFA_CODE", "That code isn't right. Check the app and try again.", 401);

    await transaction.updateTable("mfaDevices").set({
      status: "ACTIVE", pendingExpiresAt: null, lastStep: step, lastUsedAt: now,
    }).where("id", "=", pending.id).execute();
    const first = count === 0;
    const recoveryCodes = first ? await replaceRecoveryCodes(transaction, user.id, now) : null;
    await transaction.updateTable("users").set({
      mfaReenrollRequired: false, mfaFailedAttempts: 0, mfaLockedUntil: null, mfaEnrolledAt: now, updatedAt: now,
    }).where("id", "=", user.id).execute();
    await revokeTrustedDevices(transaction, user.id);
    await auditMfa("MFA_ENROLLMENT_COMPLETED", { subject: user, ...audit, executor: transaction, metadata: { deviceId: pending.id, first } });
    await auditMfa("MFA_DEVICE_ADDED", { subject: user, ...audit, executor: transaction, metadata: { deviceId: pending.id } });
    if (recoveryCodes) await auditMfa("MFA_RECOVERY_CODES_GENERATED", { subject: user, ...audit, executor: transaction });
    return { deviceId: pending.id, deviceName: pending.name, first, recoveryCodes };
  });
}

// ---- Verifying a code --------------------------------------------------------

export type VerifyResult =
  | { ok: true; method: "totp" | "recovery"; deviceId: string | null; recoveryRemaining: number | null }
  | { ok: false; reason: "invalid" | "reused" | "locked"; lockedUntil: Date | null };

/**
 * Checks an authenticator code or a recovery code with lockout and replay protection.
 * Wrong codes are counted; five in a row lock MFA attempts for the account.
 */
export async function verifyCode(userId: string, input: { code?: string; recoveryCode?: string }, now = new Date()): Promise<VerifyResult> {
  return withDatabaseTransaction(async (transaction): Promise<VerifyResult> => {
    const user = await lockUser(transaction, userId);
    if (user.disabled) return { ok: false, reason: "invalid", lockedUntil: null };
    if (isLocked(user.mfaLockedUntil, now)) return { ok: false, reason: "locked", lockedUntil: user.mfaLockedUntil };
    const person = { id: user.id, email: user.email };

    let verdict: "ok" | "invalid" | "reused" = "invalid";
    let method: "totp" | "recovery" = "totp";
    let deviceId: string | null = null;

    if (input.recoveryCode !== undefined) {
      method = "recovery";
      if (looksLikeRecoveryCode(input.recoveryCode)) {
        const used = await transaction.updateTable("mfaRecoveryCodes").set({ usedAt: now })
          .where("userId", "=", user.id).where("usedAt", "is", null)
          .where("codeHash", "in", recoveryCodeLookupHashes(input.recoveryCode))
          .returning("id").executeTakeFirst();
        if (used) verdict = "ok";
      }
    } else if (input.code) {
      const devices = await transaction.selectFrom("mfaDevices").select(["id", "secretCiphertext"])
        .where("userId", "=", user.id).where("status", "=", "ACTIVE").execute();
      for (const device of devices) {
        const step = totpStep(decryptSecret(device.secretCiphertext), input.code, now.getTime());
        if (step === null) continue;
        deviceId = device.id;
        verdict = (await consumeDeviceStep(transaction, device.id, step)) ? "ok" : "reused";
        break;
      }
    }

    if (verdict === "reused") {
      await auditMfa("MFA_LOGIN_FAILED", { subject: person, executor: transaction, metadata: { reason: "code-reused" } });
      return { ok: false, reason: "reused", lockedUntil: null };
    }
    if (verdict === "invalid") {
      const next = afterFailedAttempt(user.mfaFailedAttempts, now);
      await transaction.updateTable("users").set({ mfaFailedAttempts: next.attempts, mfaLockedUntil: next.lockedUntil })
        .where("id", "=", user.id).execute();
      await auditMfa("MFA_LOGIN_FAILED", { subject: person, executor: transaction, metadata: { method } });
      if (next.lockedUntil) await auditMfa("MFA_LOCKED", { subject: person, executor: transaction, metadata: { until: next.lockedUntil.toISOString() } });
      return { ok: false, reason: next.lockedUntil ? "locked" : "invalid", lockedUntil: next.lockedUntil };
    }

    await transaction.updateTable("users").set({ mfaFailedAttempts: 0, mfaLockedUntil: null }).where("id", "=", user.id).execute();
    let recoveryRemaining: number | null = null;
    if (method === "recovery") {
      const left = await transaction.selectFrom("mfaRecoveryCodes").select((eb) => eb.fn.countAll<string>().as("count"))
        .where("userId", "=", user.id).where("usedAt", "is", null).executeTakeFirstOrThrow();
      recoveryRemaining = Number(left.count);
      await auditMfa("MFA_RECOVERY_CODE_USED", { subject: person, executor: transaction, metadata: { remaining: recoveryRemaining } });
    }
    await auditMfa("MFA_LOGIN_SUCCESS", { subject: person, executor: transaction, metadata: { method } });
    return { ok: true, method, deviceId, recoveryRemaining };
  });
}

/** The API error for a failed verification. */
export function verifyFailure(result: Extract<VerifyResult, { ok: false }>, now = new Date()) {
  if (result.reason === "locked" && result.lockedUntil) return new MfaError("MFA_LOCKED", lockoutMessage(result.lockedUntil, now), 429);
  if (result.reason === "reused") return new MfaError("MFA_CODE_ALREADY_USED", "That code was already used. Wait for the next one in your app.", 401);
  return new MfaError("INVALID_MFA_CODE", "That code is wrong or has expired. Check your phone's time is set automatically and try again.", 401);
}

/**
 * Proof that the person at this session holds a device right now. A typed code
 * counts and refreshes the five-minute window; without one, the window must still be open.
 */
export async function requireFreshCode(session: { userId: string; sessionId?: string }, code: string | undefined, now = new Date()) {
  if (code) {
    const result = await verifyCode(session.userId, { code }, now);
    if (!result.ok) throw verifyFailure(result, now);
    if (session.sessionId) await database.updateTable("authSessions").set({ mfaStepUpAt: now }).where("id", "=", session.sessionId).execute();
    return;
  }
  const row = session.sessionId
    ? await database.selectFrom("authSessions").select("mfaStepUpAt").where("id", "=", session.sessionId).executeTakeFirst()
    : undefined;
  if (!stepUpIsFresh(row?.mfaStepUpAt ?? null, now)) {
    throw new MfaError("MFA_CODE_REQUIRED", "Enter a code from your authenticator app to continue.", 403);
  }
}

// ---- Devices and recovery codes -----------------------------------------------

export async function deleteDevice(user: Person, deviceId: string, audit: ChangeAudit = {}) {
  return withDatabaseTransaction(async (transaction) => {
    await lockUser(transaction, user.id);
    const device = await transaction.selectFrom("mfaDevices").select(["id", "name"])
      .where("id", "=", deviceId).where("userId", "=", user.id).where("status", "=", "ACTIVE").executeTakeFirst();
    if (!device) throw new MfaError("MFA_DEVICE_NOT_FOUND", "That device no longer exists.", 404);
    if (!canDeleteDevice(await activeCount(transaction, user.id))) {
      throw new MfaError("MFA_LAST_DEVICE", "You need at least one device. To remove all MFA, request removal.", 409);
    }
    await transaction.deleteFrom("mfaDevices").where("id", "=", device.id).execute();
    await revokeTrustedDevices(transaction, user.id);
    await auditMfa("MFA_DEVICE_REMOVED", { subject: user, ...audit, executor: transaction, metadata: { deviceId: device.id } });
    await auditMfa("MFA_TRUSTED_DEVICES_REVOKED", { subject: user, ...audit, executor: transaction });
    return { deviceName: device.name };
  });
}

export async function renameDevice(user: Person, deviceId: string, name: string) {
  const renamed = await database.updateTable("mfaDevices").set({ name })
    .where("id", "=", deviceId).where("userId", "=", user.id).where("status", "=", "ACTIVE").returning("id").executeTakeFirst();
  if (!renamed) throw new MfaError("MFA_DEVICE_NOT_FOUND", "That device no longer exists.", 404);
  await auditMfa("MFA_DEVICE_RENAMED", { subject: user, metadata: { deviceId } });
}

/** Replaces all recovery codes; the old ones stop working in the same transaction. */
export async function regenerateRecoveryCodes(user: Person, now = new Date(), audit: ChangeAudit = {}) {
  return withDatabaseTransaction(async (transaction) => {
    await lockUser(transaction, user.id);
    if ((await activeCount(transaction, user.id)) < 1) throw new MfaError("MFA_NOT_ENROLLED", "Set up an authenticator first.", 409);
    const codes = await replaceRecoveryCodes(transaction, user.id, now);
    await auditMfa("MFA_RECOVERY_CODES_GENERATED", { subject: user, ...audit, executor: transaction, metadata: { regenerated: true } });
    return codes;
  });
}

/** The user said "I've saved these": the temporary encrypted copy is deleted. */
export async function acknowledgeRecoveryCodes(userId: string) {
  await database.deleteFrom("mfaRecoveryReveals").where("userId", "=", userId).execute();
}

/** The still-unacknowledged codes for the "Email to me" button, limited to a few sends. */
export async function takeRevealForEmail(userId: string, now = new Date()) {
  return withDatabaseTransaction(async (transaction) => {
    const row = await transaction.selectFrom("mfaRecoveryReveals").selectAll().where("userId", "=", userId).forUpdate().executeTakeFirst();
    if (!row || row.expiresAt.getTime() < now.getTime()) throw new MfaError("MFA_CODES_EXPIRED", "These codes can no longer be emailed. Generate new ones.", 410);
    if (row.emailsSent >= REVEAL_EMAIL_LIMIT) throw new MfaError("MFA_EMAIL_LIMIT", "You have emailed these codes enough times. Use Copy or Download.", 429);
    await transaction.updateTable("mfaRecoveryReveals").set({ emailsSent: row.emailsSent + 1 }).where("userId", "=", userId).execute();
    return decryptSecret(row.ciphertext).split(" ");
  });
}

// ---- Trusted browsers ------------------------------------------------------------

export async function createTrustedDevice(user: Person, meta: { userAgent: string | null; ip: string | null }, now = new Date()) {
  const { token, hash } = generateSecret("shmt_");
  const expiresAt = trustedDeviceExpiry(now);
  await database.insertInto("mfaTrustedDevices").values({
    userId: user.id, tokenHash: hash, userAgent: meta.userAgent?.slice(0, 300) ?? null, ipAddress: meta.ip, expiresAt,
  }).execute();
  await auditMfa("MFA_TRUSTED_DEVICE_CREATED", { subject: user });
  return { token, expiresAt };
}

export async function isTrustedDevice(userId: string, token: string | undefined, now = new Date()) {
  if (!token?.startsWith("shmt_")) return false;
  const row = await database.selectFrom("mfaTrustedDevices").select("id")
    .where("tokenHash", "=", hashSecret(token)).where("userId", "=", userId)
    .where("revokedAt", "is", null).where("expiresAt", ">", now).executeTakeFirst();
  return Boolean(row);
}

// ---- Sign-in challenge: the state between the password and the code ------------------

export async function createChallenge(userId: string, kind: "CODE" | "ENROLL", meta: { orgId?: string | null; ip: string | null }, now = new Date()) {
  const { token, hash } = generateSecret("shmc_");
  await withDatabaseTransaction(async (transaction) => {
    await transaction.deleteFrom("mfaChallenges").where("userId", "=", userId).execute();
    await transaction.insertInto("mfaChallenges").values({
      userId, tokenHash: hash, kind, orgId: meta.orgId ?? null, ipAddress: meta.ip,
      expiresAt: new Date(now.getTime() + challengeTtlMs(kind)),
    }).execute();
  });
  return { token, ttlSeconds: challengeTtlMs(kind) / 1000 };
}

export async function findChallenge(token: string | undefined, now = new Date()) {
  if (!token?.startsWith("shmc_")) return null;
  return (await database.selectFrom("mfaChallenges").selectAll()
    .where("tokenHash", "=", hashSecret(token)).where("expiresAt", ">", now).executeTakeFirst()) ?? null;
}

export async function deleteChallenge(id: string) {
  await database.deleteFrom("mfaChallenges").where("id", "=", id).execute();
}

// ---- Removing MFA wholesale (approval, admin reset, disabled user) ------------------

/**
 * Deletes every device and recovery code, signs the user out everywhere
 * (trusted browsers included) and optionally forces enrollment at next sign-in.
 * Runs in the caller's transaction so the whole reset is all-or-nothing.
 */
export async function purgeMfa(
  transaction: DatabaseTransaction,
  userId: string,
  options: { forceReenroll: boolean; reason: string; cancelPendingRequests?: boolean },
) {
  await lockUser(transaction, userId);
  await transaction.deleteFrom("mfaDevices").where("userId", "=", userId).execute();
  await transaction.deleteFrom("mfaRecoveryCodes").where("userId", "=", userId).execute();
  await transaction.deleteFrom("mfaRecoveryReveals").where("userId", "=", userId).execute();
  await transaction.deleteFrom("mfaChallenges").where("userId", "=", userId).execute();
  await revokeTrustedDevices(transaction, userId);
  await revokeAllSessions(transaction, userId, options.reason);
  await transaction.updateTable("users").set({
    mfaReenrollRequired: options.forceReenroll, mfaFailedAttempts: 0, mfaLockedUntil: null, mfaEnrolledAt: null, updatedAt: new Date(),
  }).where("id", "=", userId).execute();
  if (options.cancelPendingRequests) {
    await transaction.updateTable("mfaRequests").set({ status: "CANCELLED", decidedAt: new Date(), decisionNote: options.reason })
      .where("userId", "=", userId).where("status", "=", "PENDING").execute();
  }
}
