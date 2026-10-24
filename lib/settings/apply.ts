import { withDatabaseTransaction } from "@/lib/postgres/client";
import { writePlatformAudit } from "@/lib/platform-policy";
import { loadProxyTrust, saveProxyTrust } from "@/lib/proxy-trust-store";
import { startPending, readSnapshot, type PendingChange } from "@/lib/settings/pending";
import { loadSettings, saveSettings } from "@/lib/settings/store";
import type { Review } from "@/lib/settings/review";
import type { SettingKey } from "@/lib/settings/registry";

export type Actor = { id: string | null; email: string; role: "ADMIN" };

/**
 * Saves a reviewed proposal in one transaction, audits it, and, when it could lock
 * the administrator out, leaves the previous values to be restored unless confirmed.
 */
export async function applyReview(review: Review, actor: Actor, action = "DEPLOYMENT_SETTINGS_UPDATED"): Promise<{ pending: PendingChange | null }> {
  const { resolved } = review;
  const changes: Partial<Record<SettingKey, unknown>> = { ...resolved.storeChanges };
  try {
    return await withDatabaseTransaction(async (transaction) => {
      const before = await readSnapshot(transaction);
      if (resolved.proxyChanged) await saveProxyTrust(transaction, resolved.proxy, actor.id);
      if (Object.keys(changes).length) await saveSettings(transaction, changes, actor.id);
      const after = await readSnapshot(transaction);
      const pending = review.needsConfirmation && (resolved.proxyChanged || resolved.changedKeys.length)
        ? await startPending(transaction, before, [...(resolved.proxyChanged ? ["proxy"] : []), ...resolved.changedKeys], actor.id)
        : null;
      await writePlatformAudit({
        actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, action,
        targetType: "platformConfiguration", targetId: "global",
        reason: review.changes.map((change) => `${change.label}: ${change.from} -> ${change.to}`).join("; ") || "Runtime settings updated",
        metadata: { from: before, to: after },
      }, { executor: transaction });
      return { pending };
    });
  } finally {
    // The transaction may have rolled back after the caches were updated.
    await Promise.all([loadSettings(), loadProxyTrust()]);
  }
}
