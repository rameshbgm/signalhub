import { database, withDatabaseTransaction, type DatabaseExecutor } from "@/lib/postgres/client";
import { writePlatformAudit } from "@/lib/platform-policy";
import { loadProxyTrust } from "@/lib/proxy-trust-store";

/**
 * Confirm-or-revert for changes that could lock the administrator out.
 *
 * Such a change is applied at once and the previous values are kept beside it
 * with a deadline. If the administrator does not press "Keep" before then, any
 * server (web or worker) puts the previous values back. A change you can still
 * see and confirm is, by construction, one that did not lock you out.
 */
export const CONFIRM_WINDOW_MS = 2 * 60_000;

export type Snapshot = {
  proxy: { mode: string; hops: number; cidrs: string[] };
  settings: Record<string, unknown>;
};
export type PendingChange = {
  previous: Snapshot;
  keys: string[];
  startedAt: string;
  revertAt: string;
  by: string | null;
};

export async function readPending(executor: DatabaseExecutor = database): Promise<PendingChange | null> {
  const row = await executor
    .selectFrom("platformConfiguration")
    .select("settingsPending")
    .where("id", "=", "global")
    .executeTakeFirst();
  const pending = row?.settingsPending as PendingChange | null | undefined;
  return pending && typeof pending === "object" && pending.previous ? pending : null;
}

export async function readSnapshot(executor: DatabaseExecutor = database): Promise<Snapshot> {
  const row = await executor
    .selectFrom("platformConfiguration")
    .select(["proxyTrustMode", "proxyTrustedHops", "proxyTrustedCidrs", "settings"])
    .where("id", "=", "global")
    .executeTakeFirst();
  return {
    proxy: { mode: row?.proxyTrustMode ?? "auto", hops: row?.proxyTrustedHops ?? 1, cidrs: [...(row?.proxyTrustedCidrs ?? [])] },
    settings: { ...(row?.settings ?? {}) },
  };
}

/** Records the state to return to. A change already waiting keeps its older snapshot: revert goes back to the last confirmed state. */
export async function startPending(executor: DatabaseExecutor, previous: Snapshot, keys: string[], by: string | null, now = new Date()) {
  const existing = await readPending(executor);
  const pending: PendingChange = {
    previous: existing?.previous ?? previous,
    keys: [...new Set([...(existing?.keys ?? []), ...keys])],
    startedAt: existing?.startedAt ?? now.toISOString(),
    revertAt: new Date(now.getTime() + CONFIRM_WINDOW_MS).toISOString(),
    by,
  };
  await executor.updateTable("platformConfiguration").set({ settingsPending: pending }).where("id", "=", "global").execute();
  return pending;
}

export async function confirmPending(actor: { id: string | null; email: string; role: "ADMIN" }) {
  await withDatabaseTransaction(async (transaction) => {
    const pending = await readPending(transaction);
    if (!pending) return;
    await transaction.updateTable("platformConfiguration").set({ settingsPending: null }).where("id", "=", "global").execute();
    await writePlatformAudit({
      actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, action: "SETTINGS_CONFIRMED",
      targetType: "platformConfiguration", targetId: "global", reason: `Kept the changed settings: ${pending.keys.join(", ")}`,
    }, { executor: transaction });
  });
}

/** Reverts a pending change whose deadline passed. Safe to call from every process: one wins. */
export async function expireDuePending(now = new Date()) {
  await withDatabaseTransaction(async (transaction) => {
    const row = await transaction
      .selectFrom("platformConfiguration")
      .select("settingsPending")
      .where("id", "=", "global")
      .forUpdate()
      .executeTakeFirst();
    const pending = row?.settingsPending as PendingChange | null | undefined;
    if (!pending?.previous || new Date(pending.revertAt).getTime() > now.getTime()) return;
    await restoreSnapshot(transaction, pending.previous);
    await transaction.updateTable("platformConfiguration").set({ settingsPending: null }).where("id", "=", "global").execute();
    await writePlatformAudit({
      actorId: null, actorEmail: "system", actorRole: "SYSTEM", action: "SETTINGS_REVERTED",
      targetType: "platformConfiguration", targetId: "global",
      reason: `Not confirmed in time, so the previous settings were restored: ${pending.keys.join(", ")}`,
      metadata: { keys: pending.keys, previous: pending.previous },
    }, { executor: transaction });
  });
  await refreshCaches();
}

/** The administrator pressed Revert. */
export async function revertPendingNow(actor: { id: string | null; email: string; role: "ADMIN" }) {
  await withDatabaseTransaction(async (transaction) => {
    const row = await transaction.selectFrom("platformConfiguration").select("settingsPending").where("id", "=", "global").forUpdate().executeTakeFirst();
    const pending = row?.settingsPending as PendingChange | null | undefined;
    if (!pending?.previous) return;
    await restoreSnapshot(transaction, pending.previous);
    await transaction.updateTable("platformConfiguration").set({ settingsPending: null }).where("id", "=", "global").execute();
    await writePlatformAudit({
      actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, action: "SETTINGS_REVERTED",
      targetType: "platformConfiguration", targetId: "global", reason: `Reverted the changed settings: ${pending.keys.join(", ")}`,
      metadata: { keys: pending.keys, previous: pending.previous },
    }, { executor: transaction });
  });
  await refreshCaches();
}

export async function restoreSnapshot(executor: DatabaseExecutor, snapshot: Snapshot) {
  await executor.updateTable("platformConfiguration").set({
    proxyTrustMode: snapshot.proxy.mode as "auto" | "on" | "off",
    proxyTrustedHops: snapshot.proxy.hops,
    proxyTrustedCidrs: snapshot.proxy.cidrs,
    settings: snapshot.settings,
    updatedAt: new Date(),
  }).where("id", "=", "global").execute();
}

async function refreshCaches() {
  // Imported lazily: the store imports this module to expire changes on its timer.
  const { loadSettings } = await import("@/lib/settings/store");
  await Promise.all([loadSettings(), loadProxyTrust()]);
}
