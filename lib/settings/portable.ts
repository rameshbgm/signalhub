import { MAX_PROXY_HOPS, PROXY_TRUST_MODES, parseCidrs } from "@/lib/proxy-trust";
import { parseRateLimits } from "@/lib/rate-limit-policy";
import { parseValue, settingDefinition, SETTINGS, type SettingKey } from "@/lib/settings/registry";

/** A settings file for backup, review or moving between installations. Secrets never appear in it. */
export type PortableSnapshot = {
  proxy?: { mode: string; hops: number; cidrs: string[] };
  settings: Record<string, unknown>;
};

export function exportDocument(snapshot: PortableSnapshot) {
  return { version: 1, note: "SignalHub deployment settings. Safe to share: no secrets.", ...snapshot };
}

export type ImportResult = { ok: true; snapshot: PortableSnapshot } | { ok: false; errors: string[] };
const KNOWN = new Set<string>(SETTINGS.map((item) => item.key));

/** Validates a settings file completely before anything is applied. */
export function parseImport(text: string): ImportResult {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  if (!document || typeof document !== "object" || Array.isArray(document) || (document as { version?: unknown }).version !== 1) {
    return { ok: false, errors: ["This is not a SignalHub settings file (expected version 1)."] };
  }
  const errors: string[] = [];
  const { proxy, settings } = document as { proxy?: Record<string, unknown>; settings?: Record<string, unknown> };
  const result: PortableSnapshot = { settings: {} };

  if (proxy !== undefined) {
    const mode = String(proxy.mode);
    const hops = proxy.hops;
    const ranges = parseCidrs(Array.isArray(proxy.cidrs) ? (proxy.cidrs as string[]) : []);
    if (!PROXY_TRUST_MODES.includes(mode as never)) errors.push(`Proxy mode "${mode}" is not one of auto, on, off.`);
    if (typeof hops !== "number" || !Number.isInteger(hops) || hops < 1 || hops > MAX_PROXY_HOPS) errors.push(`Proxy hops must be a whole number from 1 to ${MAX_PROXY_HOPS}.`);
    if (ranges.invalid.length) errors.push(`Not valid network ranges for the proxy: ${ranges.invalid.join(", ")}.`);
    if (!errors.length) result.proxy = { mode, hops: hops as number, cidrs: ranges.cidrs };
  }

  for (const [key, value] of Object.entries(settings ?? {})) {
    if (key === "rateLimits") {
      const limits = parseRateLimits(value);
      if (limits.ok) result.settings.rateLimits = limits.value;
      else errors.push(...limits.errors);
    } else if (!KNOWN.has(key)) errors.push(`${key} is not a known setting.`);
    else {
      const parsed = parseValue(settingDefinition(key as SettingKey), value);
      if (parsed.ok) result.settings[key] = parsed.value;
      else errors.push(`${key}: ${parsed.error}`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, snapshot: result };
}
