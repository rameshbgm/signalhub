"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { purgeMfa } from "@/lib/mfa/service";
import { writePlatformAudit } from "@/lib/platform-policy";
import { withOrganizationAdminInvariantTransaction } from "@/lib/team-owner-safety";
import { INPUT_LIMITS } from "@/lib/input-limits";
import type { DatabaseTransaction } from "@/lib/postgres/client";

export type UserAction = "disable" | "enable" | "delete";
export type UserActionResult = { done: number; failed: Array<{ id: string; message: string }> };

type Actor = Awaited<ReturnType<typeof requirePlatformCapability>>;
const MAX_BATCH = 100;

/** Another enabled Admin must remain, or nobody could manage the installation. */
async function otherEnabledAdminExists(transaction: DatabaseTransaction, userId: string) {
  return Boolean(await transaction.selectFrom("memberships")
    .innerJoin("users", "users.id", "memberships.userId")
    .select("memberships.id")
    .where("memberships.role", "=", "ADMIN")
    .where("memberships.status", "=", "ACTIVE")
    .where("users.disabled", "=", false)
    .where("users.id", "!=", userId)
    .executeTakeFirst());
}

async function isActiveAdmin(transaction: DatabaseTransaction, userId: string) {
  return Boolean(await transaction.selectFrom("memberships").select("id")
    .where("userId", "=", userId).where("role", "=", "ADMIN").where("status", "=", "ACTIVE").executeTakeFirst());
}

function audit(actor: Actor, transaction: DatabaseTransaction, action: string, user: { id: string; email: string }, reason: string) {
  return writePlatformAudit({
    actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
    action, targetType: "user", targetId: user.id, reason, metadata: { email: user.email },
  }, { executor: transaction });
}

async function disableOne(actor: Actor, userId: string, reason: string) {
  await withOrganizationAdminInvariantTransaction("global", async (transaction) => {
    const user = await transaction.selectFrom("users").selectAll().where("id", "=", userId).forUpdate().executeTakeFirst();
    if (!user) throw new Error("User not found");
    if (user.disabled) throw new Error("Already disabled");
    if (await isActiveAdmin(transaction, user.id) && !await otherEnabledAdminExists(transaction, user.id)) {
      throw new Error("The last active Admin cannot be disabled");
    }
    const now = new Date();
    const changed = await transaction.updateTable("users").set({ disabled: true, updatedAt: now })
      .where("id", "=", user.id).where("disabled", "=", false).returning("id").executeTakeFirst();
    if (!changed) throw new Error("User state changed; reload and retry");
    await transaction.updateTable("authSessions").set({ revokedAt: now, revokedReason: "user-disabled" })
      .where("userId", "=", user.id).where("revokedAt", "is", null).execute();
    // Devices and recovery codes go with the account's access; a pending MFA request has nothing left to decide.
    await purgeMfa(transaction, user.id, { forceReenroll: false, reason: "user-disabled", cancelPendingRequests: true });
    await audit(actor, transaction, "GLOBAL_USER_DISABLED", user, reason);
  });
}

async function enableOne(actor: Actor, userId: string, reason: string) {
  await withOrganizationAdminInvariantTransaction("global", async (transaction) => {
    const user = await transaction.updateTable("users").set({ disabled: false, updatedAt: new Date() })
      .where("id", "=", userId).where("disabled", "=", true).returning(["id", "email"]).executeTakeFirst();
    if (!user) throw new Error("Already active");
    await audit(actor, transaction, "GLOBAL_USER_REACTIVATED", user, reason);
  });
}

async function deleteOne(actor: Actor, userId: string, reason: string) {
  await withOrganizationAdminInvariantTransaction("global", async (transaction) => {
    const user = await transaction.selectFrom("users").selectAll().where("id", "=", userId).forUpdate().executeTakeFirst();
    if (!user) throw new Error("User not found");
    if (await isActiveAdmin(transaction, user.id) && !await otherEnabledAdminExists(transaction, user.id)) {
      throw new Error("The last active Admin cannot be deleted");
    }
    try {
      await transaction.deleteFrom("users").where("id", "=", user.id).execute();
    } catch (error) {
      // Records the account created (pages, exports, identity connections) keep it referenced.
      if ((error as { code?: string }).code === "23503") throw new Error("Has created records and cannot be deleted; disable it instead");
      throw error;
    }
    await audit(actor, transaction, "GLOBAL_USER_DELETED", user, reason);
  });
}

const OPERATIONS = { disable: disableOne, enable: enableOne, delete: deleteOne } as const;

/**
 * One entry point for the row buttons and the bulk bar. Each account is its own
 * transaction, so one that cannot be changed (the last Admin, an account with
 * history) is reported and the others still go through.
 */
export async function runUserAction(action: UserAction, ids: string[], reasonInput: string): Promise<UserActionResult> {
  // The action comes from the client: accept only our own keys, and gate each by its own capability.
  if (!Object.hasOwn(OPERATIONS, action)) throw new Error("Unknown action");
  const actor = await requirePlatformCapability(action === "delete" ? "users.delete" : "users.disable");
  const operation = OPERATIONS[action];
  const reason = reasonInput.trim();
  if (reason.length < 10) throw new Error("Enter a specific reason containing at least 10 characters");
  if (reason.length > INPUT_LIMITS.reason) throw new Error(`Reason must not exceed ${INPUT_LIMITS.reason} characters`);
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new Error("Select at least one user");
  if (unique.length > MAX_BATCH) throw new Error(`Select at most ${MAX_BATCH} users at a time`);

  const result: UserActionResult = { done: 0, failed: [] };
  for (const id of unique) {
    if (id === actor.userId) { result.failed.push({ id, message: "You cannot change your own account here" }); continue; }
    try {
      await operation(actor, id, reason);
      result.done += 1;
    } catch (error) {
      unstable_rethrow(error);
      result.failed.push({ id, message: error instanceof Error && error.message.length <= 200 ? error.message : "Could not be changed" });
    }
  }
  revalidatePath("/organization/platform/users");
  return result;
}
