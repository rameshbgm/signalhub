import { sql } from "kysely";
import { auditMfa } from "@/lib/mfa/audit";
import { sendMfaMail } from "@/lib/mfa/mail";
import { cooldownUntil, isOverdue, REJECTION_COOLDOWN_HOURS, requestExpiry } from "@/lib/mfa/policy";
import { lockUser, MfaError, purgeMfa } from "@/lib/mfa/service";
import { database, withDatabaseTransaction, type DatabaseExecutor } from "@/lib/postgres/client";
import type { MfaRequestStatus } from "@/lib/postgres/schema";
import { generateSecret, hashSecret } from "@/lib/secrets";
import { appBaseUrl } from "@/lib/settings/request";
type Person = { id: string; email: string };
type Admin = { id: string; email: string };

const CLOSED_MESSAGES: Record<Exclude<MfaRequestStatus, "PENDING">, string> = {
  APPROVED: "This request was already approved.",
  REJECTED: "This request was already rejected.",
  CANCELLED: "This request was cancelled, so nothing was changed.",
  EXPIRED: "This request expired. The person can file a new one.",
};

/** The clear message for a request that is no longer open. */
function closedError(status: MfaRequestStatus) {
  return new MfaError("MFA_REQUEST_CLOSED", status === "PENDING" ? CLOSED_MESSAGES.EXPIRED : CLOSED_MESSAGES[status], 409);
}

const cancelUrl = (token: string) => {
  const base = appBaseUrl();
  return base ? `${base}/mfa/cancel/${encodeURIComponent(token)}` : "";
};

// ---- The user's side ---------------------------------------------------------------

export async function createRequest(
  user: Person,
  input: { type: "REMOVE_ALL" | "LOST_DEVICE"; admin?: Person; reason: string; ip: string | null; userAgent: string | null },
  now = new Date(),
) {
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new MfaError("MFA_REASON_INVALID", "Give a short reason (5 to 500 characters).", 400);
  const { token, hash } = generateSecret("shmq_");
  const request = await withDatabaseTransaction(async (transaction) => {
    await lockUser(transaction, user.id);
    const pending = await transaction.selectFrom("mfaRequests").select("id")
      .where("userId", "=", user.id).where("status", "=", "PENDING").where("expiresAt", ">", now).executeTakeFirst();
    if (pending) throw new MfaError("MFA_REQUEST_EXISTS", "You already have a request waiting for an administrator.", 409);
    const rejected = await transaction.selectFrom("mfaRequests").select("decidedAt")
      .where("userId", "=", user.id).where("status", "=", "REJECTED").orderBy("decidedAt", "desc").executeTakeFirst();
    const until = cooldownUntil(rejected?.decidedAt ?? null, now);
    if (until) {
      throw new MfaError("MFA_REQUEST_COOLDOWN", `Your last request was declined. You can file a new one after ${until.toUTCString()}.`, 429);
    }
    // An expired request that the sweep has not reached yet must not block a new one.
    await transaction.updateTable("mfaRequests").set({ status: "EXPIRED", decidedAt: now })
      .where("userId", "=", user.id).where("status", "=", "PENDING").execute();
    const row = await transaction.insertInto("mfaRequests").values({
      userId: user.id, type: input.type, reason, ipAddress: input.ip, userAgent: input.userAgent?.slice(0, 300) ?? null,
      cancelTokenHash: hash, expiresAt: requestExpiry(now),
    }).returning(["id", "type"]).executeTakeFirstOrThrow();
    await auditMfa("MFA_REQUEST_CREATED", { subject: user, admin: input.admin, executor: transaction, reason, metadata: { requestId: row.id, type: input.type } });
    return row;
  });
  return { requestId: request.id, cancelToken: token, cancelUrl: cancelUrl(token) };
}

/** Mail for a request that was just created: the owner, with a cancel link, and every other admin. */
export async function notifyRequestCreated(
  user: { id: string; email: string; name: string; username: string },
  created: { cancelUrl: string }, type: "REMOVE_ALL" | "LOST_DEVICE",
) {
  await sendMfaMail(user.email, user.name || user.username, { kind: "request-created", type, cancelUrl: created.cancelUrl });
  const admins = await database.selectFrom("users").innerJoin("memberships", "memberships.userId", "users.id")
    .select(["users.email", "users.name", "users.username"]).distinct()
    .where("memberships.role", "=", "ADMIN").where("memberships.status", "=", "ACTIVE")
    .where("users.disabled", "=", false).where("users.id", "!=", user.id).execute();
  const base = appBaseUrl();
  for (const admin of admins) {
    await sendMfaMail(admin.email, admin.name || admin.username, {
      kind: "admin-new-request", userLabel: user.username, reviewUrl: base ? `${base}/organization/platform/mfa-requests` : "Open Platform > Security > MFA requests",
    });
  }
}

type CancelTarget = { id: string; userId: string } | { token: string };

/**
 * Cancels a pending request. The conditional UPDATE is the arbiter: if an admin
 * approved the same request a moment earlier, this matches nothing and says so.
 */
export async function cancelRequest(target: CancelTarget, now = new Date()) {
  return withDatabaseTransaction(async (transaction) => {
    let update = transaction.updateTable("mfaRequests").set({ status: "CANCELLED", decidedAt: now })
      .where("status", "=", "PENDING").where("expiresAt", ">", now);
    update = "token" in target
      ? update.where("cancelTokenHash", "=", hashSecret(target.token))
      : update.where("id", "=", target.id).where("userId", "=", target.userId);
    const cancelled = await update.returning(["id", "userId"]).executeTakeFirst();
    if (!cancelled) {
      let lookup = transaction.selectFrom("mfaRequests").select("status");
      lookup = "token" in target
        ? lookup.where("cancelTokenHash", "=", hashSecret(target.token))
        : lookup.where("id", "=", target.id).where("userId", "=", target.userId);
      const row = await lookup.executeTakeFirst();
      if (!row) throw new MfaError("MFA_REQUEST_NOT_FOUND", "This request does not exist.", 404);
      throw closedError(row.status);
    }
    const user = await transaction.selectFrom("users").select(["id", "email"]).where("id", "=", cancelled.userId).executeTakeFirstOrThrow();
    await auditMfa("MFA_REQUEST_CANCELLED", { subject: user, executor: transaction, metadata: { requestId: cancelled.id, viaEmailLink: "token" in target } });
    return { requestId: cancelled.id };
  });
}

/** What the user's own settings card shows about their request, and any cooldown. */
export async function requestStateFor(userId: string, now = new Date()) {
  const latest = await database.selectFrom("mfaRequests").select(["id", "type", "status", "createdAt", "expiresAt", "decidedAt", "decisionNote"])
    .where("userId", "=", userId).orderBy("createdAt", "desc").executeTakeFirst();
  const pending = latest && latest.status === "PENDING" && latest.expiresAt.getTime() > now.getTime() ? latest : null;
  const rejected = latest?.status === "REJECTED" ? latest : null;
  return {
    pending,
    cooldownUntil: cooldownUntil(rejected?.decidedAt ?? null, now),
    lastRejectedNote: rejected?.decisionNote ?? null,
  };
}

/** What the cancel page shows, with no side effects (mail scanners open links). */
export async function describeCancelToken(token: string, now = new Date()) {
  if (!token.startsWith("shmq_")) return null;
  const row = await database.selectFrom("mfaRequests").innerJoin("users", "users.id", "mfaRequests.userId")
    .select(["mfaRequests.status", "mfaRequests.expiresAt", "mfaRequests.type", "users.username"])
    .where("mfaRequests.cancelTokenHash", "=", hashSecret(token)).executeTakeFirst();
  if (!row) return null;
  return { type: row.type, username: row.username, status: row.status === "PENDING" && row.expiresAt.getTime() <= now.getTime() ? "EXPIRED" as const : row.status };
}

// ---- The admin's side -----------------------------------------------------------------

export async function activeAdminCount(executor: DatabaseExecutor = database) {
  const row = await executor.selectFrom("users").innerJoin("memberships", "memberships.userId", "users.id")
    .select((eb) => eb.fn.count<string>("users.id").distinct().as("count"))
    .where("memberships.role", "=", "ADMIN").where("memberships.status", "=", "ACTIVE").where("users.disabled", "=", false)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/**
 * Approval is all-or-nothing in one transaction: the conditional status change
 * (the single winner against cancel or a second admin), then every device and
 * code deleted, everyone signed out, re-enrollment forced.
 */
export async function approveRequest(requestId: string, admin: Admin, options: { breakGlass?: boolean } = {}, now = new Date()) {
  return withDatabaseTransaction(async (transaction) => {
    const request = await transaction.selectFrom("mfaRequests").select(["id", "userId", "status"]).where("id", "=", requestId).executeTakeFirst();
    if (!request) throw new MfaError("MFA_REQUEST_NOT_FOUND", "This request does not exist.", 404);
    const own = request.userId === admin.id;
    if (options.breakGlass && !own) throw new MfaError("MFA_BREAK_GLASS_INVALID", "Break-glass is only for your own request.", 400);
    if (own && !options.breakGlass) throw new MfaError("MFA_SELF_APPROVAL", "You can't approve your own request. Another administrator must.", 403);
    if (own && (await activeAdminCount(transaction)) !== 1) {
      throw new MfaError("MFA_BREAK_GLASS_UNAVAILABLE", "Break-glass is only available when you are the only administrator.", 403);
    }
    const won = await transaction.updateTable("mfaRequests")
      .set({ status: "APPROVED", decidedBy: admin.id, decidedAt: now, breakGlass: Boolean(options.breakGlass) })
      .where("id", "=", requestId).where("status", "=", "PENDING").where("expiresAt", ">", now)
      .returning(["id", "userId"]).executeTakeFirst();
    if (!won) {
      const current = await transaction.selectFrom("mfaRequests").select("status").where("id", "=", requestId).executeTakeFirstOrThrow();
      throw closedError(current.status);
    }
    const user = await transaction.selectFrom("users").select(["id", "email", "name", "username"]).where("id", "=", won.userId).executeTakeFirstOrThrow();
    await purgeMfa(transaction, user.id, { forceReenroll: true, reason: "mfa-request-approved" });
    await auditMfa("MFA_REQUEST_APPROVED", { subject: user, admin, executor: transaction, metadata: { requestId, breakGlass: Boolean(options.breakGlass) } });
    if (options.breakGlass) await auditMfa("MFA_BREAK_GLASS", { subject: user, admin, executor: transaction, metadata: { requestId } });
    return user;
  });
}

export async function rejectRequest(requestId: string, admin: Admin, note: string, now = new Date()) {
  const text = note.trim();
  if (text.length < 3) throw new MfaError("MFA_NOTE_REQUIRED", "Write a short note explaining the rejection.", 400);
  return withDatabaseTransaction(async (transaction) => {
    const rejected = await transaction.updateTable("mfaRequests")
      .set({ status: "REJECTED", decidedBy: admin.id, decidedAt: now, decisionNote: text.slice(0, 500) })
      .where("id", "=", requestId).where("status", "=", "PENDING").where("expiresAt", ">", now)
      .returning(["id", "userId"]).executeTakeFirst();
    if (!rejected) {
      const current = await transaction.selectFrom("mfaRequests").select("status").where("id", "=", requestId).executeTakeFirst();
      if (!current) throw new MfaError("MFA_REQUEST_NOT_FOUND", "This request does not exist.", 404);
      throw closedError(current.status);
    }
    const user = await transaction.selectFrom("users").select(["id", "email", "name", "username"]).where("id", "=", rejected.userId).executeTakeFirstOrThrow();
    await auditMfa("MFA_REQUEST_REJECTED", { subject: user, admin, executor: transaction, reason: text, metadata: { requestId } });
    return { user, note: text, cooldownHours: REJECTION_COOLDOWN_HOURS };
  });
}

/** Direct reset from a user's profile: the same automatic steps as an approval, without a request. */
export async function adminResetMfa(userId: string, admin: Admin, reason: string) {
  const text = reason.trim();
  if (text.length < 5) throw new MfaError("MFA_REASON_INVALID", "Give a short reason (at least 5 characters).", 400);
  if (userId === admin.id) throw new MfaError("MFA_SELF_APPROVAL", "You can't reset your own MFA. Another administrator must.", 403);
  return withDatabaseTransaction(async (transaction) => {
    const user = await transaction.selectFrom("users").select(["id", "email", "name", "username"]).where("id", "=", userId).executeTakeFirst();
    if (!user) throw new MfaError("MFA_USER_NOT_FOUND", "That user does not exist.", 404);
    await purgeMfa(transaction, user.id, { forceReenroll: true, reason: "mfa-admin-reset", cancelPendingRequests: true });
    await auditMfa("MFA_ADMIN_RESET", { subject: user, admin, executor: transaction, reason: text });
    return user;
  });
}

/**
 * An administrator deletes one device of someone else. If it was their last, they
 * must enroll again at next sign-in (the same state as a reset).
 */
export async function adminDeleteDevice(userId: string, deviceId: string, admin: Admin, reason: string) {
  const text = reason.trim();
  if (text.length < 5) throw new MfaError("MFA_REASON_INVALID", "Give a short reason (at least 5 characters).", 400);
  if (userId === admin.id) throw new MfaError("MFA_SELF_APPROVAL", "Manage your own devices from your Security settings.", 403);
  return withDatabaseTransaction(async (transaction) => {
    const user = await lockUser(transaction, userId);
    const device = await transaction.selectFrom("mfaDevices").select(["id", "name"])
      .where("id", "=", deviceId).where("userId", "=", userId).where("status", "=", "ACTIVE").executeTakeFirst();
    if (!device) throw new MfaError("MFA_DEVICE_NOT_FOUND", "That device no longer exists.", 404);
    await transaction.deleteFrom("mfaDevices").where("id", "=", device.id).execute();
    const left = await transaction.selectFrom("mfaDevices").select((eb) => eb.fn.countAll<string>().as("count"))
      .where("userId", "=", userId).where("status", "=", "ACTIVE").executeTakeFirstOrThrow();
    const none = Number(left.count) === 0;
    if (none) {
      await transaction.deleteFrom("mfaRecoveryCodes").where("userId", "=", userId).execute();
      await transaction.updateTable("users").set({ mfaReenrollRequired: true, mfaEnrolledAt: null, updatedAt: new Date() }).where("id", "=", userId).execute();
    }
    await transaction.updateTable("mfaTrustedDevices").set({ revokedAt: new Date() }).where("userId", "=", userId).where("revokedAt", "is", null).execute();
    await auditMfa("MFA_DEVICE_REMOVED", { subject: { id: user.id, email: user.email }, admin, executor: transaction, reason: text, metadata: { deviceId: device.id, last: none } });
    return { user: { id: user.id, email: user.email, name: user.name, username: user.username }, deviceName: device.name, last: none };
  });
}

export async function listUserDevices(userId: string) {
  return database.selectFrom("mfaDevices").select(["id", "name", "createdAt", "lastUsedAt"])
    .where("userId", "=", userId).where("status", "=", "ACTIVE").orderBy("createdAt").execute();
}

export async function adminClearLockout(userId: string, admin: Admin) {
  const user = await database.selectFrom("users").select(["id", "email"]).where("id", "=", userId).executeTakeFirst();
  if (!user) throw new MfaError("MFA_USER_NOT_FOUND", "That user does not exist.", 404);
  await database.updateTable("users").set({ mfaFailedAttempts: 0, mfaLockedUntil: null }).where("id", "=", userId).execute();
  await auditMfa("MFA_LOCKOUT_CLEARED", { subject: user, admin });
}

export type RequestFilter = MfaRequestStatus | "OVERDUE" | "ALL";

export async function listRequests(filter: RequestFilter = "PENDING", now = new Date()) {
  let query = database.selectFrom("mfaRequests").innerJoin("users", "users.id", "mfaRequests.userId")
    .leftJoin("users as decider", "decider.id", "mfaRequests.decidedBy")
    .select([
      "mfaRequests.id", "mfaRequests.userId", "mfaRequests.type", "mfaRequests.reason", "mfaRequests.status",
      "mfaRequests.ipAddress", "mfaRequests.userAgent", "mfaRequests.createdAt", "mfaRequests.expiresAt",
      "mfaRequests.decidedAt", "mfaRequests.decisionNote", "mfaRequests.breakGlass",
      "users.username", "users.email", "users.name", "users.createdAt as accountCreatedAt", "decider.username as deciderUsername",
    ]);
  if (filter === "OVERDUE") query = query.where("mfaRequests.status", "=", "PENDING");
  else if (filter !== "ALL") query = query.where("mfaRequests.status", "=", filter);
  const rows = await query.orderBy("mfaRequests.createdAt", "desc").limit(200).execute();
  const decorated = rows.map((row) => ({ ...row, overdue: row.status === "PENDING" && isOverdue(row.createdAt, now) }));
  return filter === "OVERDUE" ? decorated.filter((row) => row.overdue) : decorated;
}

/** Device count, last use and lockout for a page of users, in one query. */
export async function mfaOverview(userIds: string[], now = new Date()) {
  if (!userIds.length) return new Map<string, { devices: number; lastUsedAt: Date | null; lockedUntil: Date | null; reenroll: boolean }>();
  const rows = await database.selectFrom("users")
    .leftJoin("mfaDevices", (join) => join.onRef("mfaDevices.userId", "=", "users.id").on("mfaDevices.status", "=", "ACTIVE"))
    .select((eb) => ["users.id", "users.mfaLockedUntil", "users.mfaReenrollRequired",
      eb.fn.count<string>("mfaDevices.id").as("devices"), eb.fn.max("mfaDevices.lastUsedAt").as("lastUsedAt")])
    .where("users.id", "in", userIds).groupBy("users.id").execute();
  return new Map(rows.map((row) => [row.id, {
    devices: Number(row.devices),
    lastUsedAt: row.lastUsedAt,
    lockedUntil: row.mfaLockedUntil && row.mfaLockedUntil.getTime() > now.getTime() ? row.mfaLockedUntil : null,
    reenroll: row.mfaReenrollRequired,
  }]));
}

// ---- Housekeeping (worker) --------------------------------------------------------------

/** Expires old requests and abandoned setups, and clears finished sign-in challenges. */
export async function expireMfaState(now = new Date()) {
  const requests = await database.updateTable("mfaRequests").set({ status: "EXPIRED", decidedAt: now })
    .where("status", "=", "PENDING").where("expiresAt", "<=", now).returning(["id", "userId"]).execute();
  for (const request of requests) {
    const user = await database.selectFrom("users").select(["id", "email"]).where("id", "=", request.userId).executeTakeFirst();
    if (user) await auditMfa("MFA_REQUEST_EXPIRED", { subject: user, metadata: { requestId: request.id } });
  }
  const abandoned = await database.deleteFrom("mfaDevices").where("status", "=", "PENDING").where("pendingExpiresAt", "<=", now)
    .returning("userId").execute();
  for (const userId of new Set(abandoned.map((row) => row.userId))) {
    const user = await database.selectFrom("users").select(["id", "email"]).where("id", "=", userId).executeTakeFirst();
    if (user) await auditMfa("MFA_ENROLLMENT_ABANDONED", { subject: user, metadata: { expired: true } });
  }
  await database.deleteFrom("mfaChallenges").where("expiresAt", "<=", now).execute();
  await database.deleteFrom("mfaRecoveryReveals").where("expiresAt", "<=", now).execute();
  await database.deleteFrom("mfaTrustedDevices").where("expiresAt", "<=", sql<Date>`now() - interval '7 days'`).execute();
  return { expiredRequests: requests.length, abandonedSetups: abandoned.length };
}
