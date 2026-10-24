"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { getSession } from "@/lib/auth";
import { revokeSessionsExcept } from "@/lib/mfa/service";
import { setting } from "@/lib/settings/effective";
import { database } from "@/lib/postgres/client";
import { loadProxyTrust } from "@/lib/proxy-trust-store";
import { applyReview } from "@/lib/settings/apply";
import { confirmPending, readSnapshot, revertPendingNow, type Snapshot } from "@/lib/settings/pending";
import { buildReview, currentConfiguration, type ProposalInput } from "@/lib/settings/review";
import { loadSettings, saveSettings } from "@/lib/settings/store";
import { writePlatformAudit } from "@/lib/platform-policy";
import { withDatabaseTransaction } from "@/lib/postgres/client";
import { LIMITERS, parseRateLimits, resolveLimit, type LimiterId } from "@/lib/rate-limit-policy";
import { SETTINGS, type SettingKey } from "@/lib/settings/registry";

/** Plain objects in and out: these are called from client components, not forms. */
const PATH = "/organization/platform/deployment";

async function fresh() {
  await Promise.all([loadSettings(), loadProxyTrust()]);
  return currentConfiguration();
}

function serialisable(review: ReturnType<typeof buildReview>) {
  const { resolved, ...rest } = review;
  return { ...rest, ignoredLocked: resolved.ignoredLocked };
}

export async function reviewDeployment(input: ProposalInput) {
  await requirePlatformCapability("configuration.manage");
  return serialisable(buildReview(await headers(), input, await fresh()));
}

export type ApplyResult =
  | { ok: true; message: string; pendingUntil: string | null }
  | { ok: false; reason: "blocked" | "needs-acceptance"; message: string; review: ReturnType<typeof serialisable> };

export async function applyDeployment(input: ProposalInput, accepted: string[]): Promise<ApplyResult> {
  const actor = await requirePlatformCapability("configuration.manage");
  const review = buildReview(await headers(), input, await fresh());
  if (review.blocking) return { ok: false, reason: "blocked", message: "Fix the problems marked as errors first.", review: serialisable(review) };
  if (review.warningIds.some((id) => !accepted.includes(id))) {
    return { ok: false, reason: "needs-acceptance", message: "Tick the warnings you want to accept, or fix them.", review: serialisable(review) };
  }
  const mfaWasOn = setting("mfaEnabled");
  const { pending } = await applyReview(review, { id: actor.platformAdminId, email: actor.email, role: actor.role });
  await loadSettings();
  // Sessions opened while codes were not required must not outlive the switch being turned on.
  if (!mfaWasOn && setting("mfaEnabled")) await revokeSessionsExcept((await getSession())?.sessionId, "mfa-enforced");
  revalidatePath(PATH);
  revalidatePath("/organization/platform/configuration");
  return {
    ok: true,
    pendingUntil: pending?.revertAt ?? null,
    message: pending ? "Applied. Press Keep within two minutes, or the previous settings come back." : "Saved. Other servers pick it up within 30 seconds.",
  };
}

export async function confirmDeployment() {
  const actor = await requirePlatformCapability("configuration.manage");
  await confirmPending({ id: actor.platformAdminId, email: actor.email, role: actor.role });
  revalidatePath(PATH);
  return "Settings kept.";
}

export async function revertDeployment() {
  const actor = await requirePlatformCapability("configuration.manage");
  await revertPendingNow({ id: actor.platformAdminId, email: actor.email, role: actor.role });
  revalidatePath(PATH);
  return "Previous settings restored.";
}

/** An explicit action by the administrator: any warnings it raises are accepted along with it. */
async function acceptingWarnings(input: ProposalInput) {
  const review = buildReview(await headers(), input, await fresh());
  return applyDeployment(input, review.warningIds);
}

/** Every setting back to its default and the proxy back to Auto. Goes through the same checks and confirmation as any change. */
export async function resetDeployment(): Promise<ApplyResult> {
  return acceptingWarnings({
    proxy: { mode: "auto", hops: 1, cidrs: [] },
    settings: {},
    reset: SETTINGS.map((definition) => definition.key) as SettingKey[],
  });
}

/** Restores the values an earlier change started from (the "from" of a history entry). */
export async function restoreFromHistory(auditId: string): Promise<ApplyResult> {
  await requirePlatformCapability("configuration.manage");
  const row = await database.selectFrom("platformAuditLogs").select("metadata").where("id", "=", auditId).executeTakeFirst();
  const from = (row?.metadata as { from?: Snapshot } | null)?.from;
  if (!from?.proxy || !from.settings) {
    return { ok: false, reason: "blocked", message: "That entry has no earlier values to restore.", review: serialisable(buildReview(await headers(), { proxy: { mode: "auto", hops: 1, cidrs: [] }, settings: {}, reset: [] }, await fresh())) };
  }
  const current = await fresh();
  return acceptingWarnings({
    proxy: { mode: from.proxy.mode as "auto" | "on" | "off", hops: from.proxy.hops, cidrs: from.proxy.cidrs },
    settings: from.settings as ProposalInput["settings"],
    reset: (Object.keys(current.stored) as SettingKey[]).filter((key) => !(key in from.settings)),
  });
}

/** Saves the abuse-protection limits. Not a lock-out risk (floors keep protection on), so no trial period. */
export async function saveRateLimits(values: unknown): Promise<{ ok: boolean; message: string; errors?: string[] }> {
  const actor = await requirePlatformCapability("configuration.manage");
  const parsed = parseRateLimits(values);
  if (!parsed.ok) return { ok: false, message: "Some limits are out of range.", errors: parsed.errors };
  const locked = new Set(LIMITERS.filter((limiter) => resolveLimit(limiter.id).source === "environment").map((limiter) => limiter.id));
  const next = Object.fromEntries(Object.entries(parsed.value).filter(([id]) => !locked.has(id as LimiterId)));
  await withDatabaseTransaction(async (transaction) => {
    const before = await readSnapshot(transaction);
    await saveSettings(transaction, { rateLimits: Object.keys(next).length ? next : undefined }, actor.platformAdminId);
    await writePlatformAudit({
      actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role, action: "RATE_LIMITS_UPDATED",
      targetType: "platformConfiguration", targetId: "global",
      reason: Object.keys(next).length ? `Rate limits changed: ${Object.entries(next).map(([id, value]) => `${id} ${(value as { limit: number; windowSeconds: number }).limit}/${(value as { limit: number; windowSeconds: number }).windowSeconds}s`).join(", ")}` : "Rate limits reset to their defaults",
      metadata: { from: before, to: { rateLimits: next } },
    }, { executor: transaction });
  });
  revalidatePath(PATH);
  return { ok: true, message: locked.size ? "Saved. Limits fixed by the environment were left as they are." : "Saved. The next request uses the new limits." };
}
