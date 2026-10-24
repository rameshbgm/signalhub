import { database, type DatabaseExecutor } from "@/lib/postgres/client";
import { errorFields, logger } from "@/lib/logger";
import { loadProxyTrust } from "@/lib/proxy-trust-store";
import { setStoredSettings, type StoredSettings } from "@/lib/settings/effective";
import { expireDuePending } from "@/lib/settings/pending";
import { SETTINGS, type SettingKey } from "@/lib/settings/registry";

const REFRESH_MS = 30_000;
/** Registry settings plus the keyed groups that have their own editors. */
const KNOWN = new Set<string>([...SETTINGS.map((item) => item.key), "rateLimits"]);

/** Reads the saved settings into this process. Unknown keys (from a newer version) are ignored. */
export async function loadSettings(executor: DatabaseExecutor = database): Promise<StoredSettings> {
  const row = await executor
    .selectFrom("platformConfiguration")
    .select("settings")
    .where("id", "=", "global")
    .executeTakeFirst();
  const saved = row?.settings && typeof row.settings === "object" ? row.settings : {};
  const known = Object.fromEntries(Object.entries(saved).filter(([key]) => KNOWN.has(key)));
  setStoredSettings(known);
  return known;
}

/** Merges changes into the saved settings; a value of undefined resets that setting to its default. */
export async function saveSettings(
  executor: DatabaseExecutor,
  changes: Partial<Record<SettingKey | "rateLimits", unknown>>,
  updatedBy: string | null,
): Promise<StoredSettings> {
  const current = await loadSettings(executor);
  const next: StoredSettings = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  const row = { settings: next, updatedBy, updatedAt: new Date() };
  await executor.insertInto("platformConfiguration")
    .values({ id: "global", ...row })
    .onConflict((conflict) => conflict.column("id").doUpdateSet(row))
    .execute();
  setStoredSettings(next);
  return next;
}

/**
 * Keeps this process's copy current (another replica may have saved a change).
 * The saving process updates immediately; the rest follow within 30 seconds.
 */
export function startSettingsRefresh() {
  // Revert an unconfirmed lock-out-capable change first, so the copy we load is the one in force.
  const refresh = () =>
    expireDuePending()
      .then(() => Promise.all([loadSettings(), loadProxyTrust()]))
      .catch((error) =>
      logger.warn(errorFields(error), "Could not load the installation settings"));
  void refresh();
  setInterval(refresh, REFRESH_MS).unref();
}
