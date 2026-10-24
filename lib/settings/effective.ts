import { parseEnvValue, parseValue, settingDefinition, type SettingKey, type SettingValue, type SettingValues } from "@/lib/settings/registry";

/**
 * What is in force for each setting: environment, then the admin's saved value,
 * then the default. Always yields a usable value: anything unreadable falls back
 * to the default and says so, so a bad row can never break a request.
 *
 * No database import (setup mode, the proxy and the worker use it); the saved
 * values are filled in by lib/settings/store.ts.
 */
export type SettingSource = "environment" | "admin" | "default";
export type EffectiveSetting<K extends SettingKey = SettingKey> = {
  value: SettingValues[K];
  source: SettingSource;
  /** Why a stored or environment value was ignored, if it was. */
  invalid?: string;
};
export type StoredSettings = Partial<Record<string, unknown>>;

// globalThis: Next may bundle instrumentation, the proxy and route handlers separately.
const STORE = Symbol.for("signalhub.settings");
const store = globalThis as unknown as Record<symbol, StoredSettings | undefined>;

export function storedSettings(): StoredSettings {
  return store[STORE] ?? {};
}

export function setStoredSettings(values: StoredSettings) {
  store[STORE] = { ...values };
}

/** Ignore admin-saved values entirely (break-glass when the admin UI cannot be reached). */
export function safeMode(env: Record<string, string | undefined> = process.env) {
  return env.SIGNALHUB_SAFE_MODE?.trim().toLowerCase() === "true";
}

export function effectiveSetting<K extends SettingKey>(
  key: K,
  env: Record<string, string | undefined> = process.env,
  stored: StoredSettings = storedSettings(),
): EffectiveSetting<K> {
  const definition = settingDefinition(key);
  const fallback = definition.default as SettingValue;
  let invalid: string | undefined;

  const raw = definition.env ? env[definition.env] : undefined;
  if (raw !== undefined && raw.trim() !== "") {
    const parsed = parseEnvValue(definition, raw);
    if (parsed.ok) return { value: parsed.value as SettingValues[K], source: "environment" };
    if (definition.kind === "cidrs" && definition.failClosed) {
      const entries = raw.split(/[\s,]+/).filter(Boolean);
      const bad = entries.filter((entry) => !parseValue(definition, [entry]).ok);
      return { value: entries as SettingValues[K], source: "environment", invalid: `${definition.env} has entries that are not valid ranges and match nothing: ${bad.join(", ")}` };
    }
    invalid = `${definition.env} is ignored: ${parsed.error}`;
  }

  if (!safeMode(env) && stored[key] !== undefined) {
    const parsed = parseValue(definition, stored[key]);
    if (parsed.ok) return { value: parsed.value as SettingValues[K], source: "admin", ...(invalid ? { invalid } : {}) };
    invalid = `The saved value is ignored: ${parsed.error}`;
  }

  return { value: fallback as SettingValues[K], source: "default", ...(invalid ? { invalid } : {}) };
}

/** The value in force right now. */
export function setting<K extends SettingKey>(key: K): SettingValues[K] {
  return effectiveSetting(key).value;
}
