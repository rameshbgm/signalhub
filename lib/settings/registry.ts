import { parseCidrs } from "@/lib/proxy-trust";

/**
 * Every admin-controllable setting in one place: what it is, its default (always
 * today's behaviour, so upgrades change nothing), its limits, the environment
 * variable that overrides it, and whether a wrong value could lock the admin out.
 *
 * Pure: no database and no process state. Storage and caching are in
 * lib/settings/store.ts and lib/settings/effective.ts.
 */
export type SettingGroup = "network" | "https" | "access" | "policy" | "monitoring" | "worker";

type Base = {
  key: string;
  group: SettingGroup;
  label: string;
  help: string;
  /** Environment variable that overrides (and locks) the admin value. */
  env?: string;
  /** A wrong value could cut the administrator off: changes are confirm-or-revert. */
  lockout?: boolean;
  /** Needs a process restart to take effect (none yet; used for worker settings). */
  restart?: boolean;
};

export type BooleanSetting = Base & { kind: "boolean"; default: boolean };
export type IntegerSetting = Base & { kind: "integer"; default: number; min: number; max: number; unit?: string };
export type EnumSetting = Base & { kind: "enum"; default: string; options: readonly { value: string; label: string }[] };
export type UrlSetting = Base & { kind: "url"; default: null };
/** failClosed: an environment list with a bad entry is kept (bad entries match nothing) instead of ignored, so a typo never lifts a restriction. */
export type CidrsSetting = Base & { kind: "cidrs"; default: string[]; failClosed?: boolean };
export type SettingDefinition = BooleanSetting | IntegerSetting | EnumSetting | UrlSetting | CidrsSetting;
export type SettingValue = boolean | number | string | string[] | null;

const hour = 60 * 60;
const day = 24 * hour;

export const SETTINGS = [
  {
    key: "publicUrl", group: "https", kind: "url", default: null, env: "NEXT_PUBLIC_APP_URL", lockout: true,
    label: "Public address",
    help: "The address people type, such as https://status.example.com. Used in emails, invitations, single sign-on callbacks and embed code.",
  },
  {
    key: "secureCookies", group: "https", kind: "enum", default: "auto", lockout: true,
    label: "Secure cookies",
    help: "Auto marks the sign-in cookie Secure when the site is served over HTTPS and leaves it usable over plain HTTP (a LAN or intranet). Always requires HTTPS.",
    options: [{ value: "auto", label: "Auto" }, { value: "always", label: "Always" }],
  },
  {
    key: "hsts", group: "https", kind: "enum", default: "auto",
    label: "Strict-Transport-Security (HSTS)",
    help: "Tells browsers to use HTTPS only. Auto sends it when the public address and the current request are HTTPS. Browsers remember it for six months.",
    options: [{ value: "auto", label: "Auto" }, { value: "on", label: "Always on HTTPS" }, { value: "off", label: "Off" }],
  },
  {
    key: "adminCidrs", group: "access", kind: "cidrs", default: [], env: "PLATFORM_ADMIN_ALLOWED_CIDRS", lockout: true, failClosed: true,
    label: "Platform administration networks",
    help: "Only these networks can open Platform administration. Empty means any network. Your own address must stay inside.",
  },
  {
    key: "sessionIdleSeconds", group: "policy", kind: "integer", default: 8 * hour, min: 15 * 60, max: 30 * day, unit: "seconds", env: "TENANT_SESSION_IDLE_SECONDS",
    label: "Sign out after inactivity",
    help: "How long a signed-in session may sit idle. Applies to new sessions.",
  },
  {
    key: "sessionAbsoluteSeconds", group: "policy", kind: "integer", default: 7 * day, min: hour, max: 90 * day, unit: "seconds", env: "TENANT_SESSION_ABSOLUTE_SECONDS",
    label: "Maximum session length",
    help: "A session ends after this long, however active. Applies to new sessions.",
  },
  {
    key: "passwordMinLength", group: "policy", kind: "integer", default: 14, min: 12, max: 128, unit: "characters", env: "PASSWORD_MIN_LENGTH",
    label: "Minimum password length",
    help: "Applies when someone sets or changes a password.",
  },
  {
    key: "mfaEnabled", group: "policy", kind: "boolean", default: false, lockout: true,
    label: "Require authenticator codes",
    help: "On: everyone signs in with a code from an authenticator app and must set one up first. Off: nobody is asked for a code, even people who already set one up; their devices are kept for when you turn it back on. Public status pages are never affected.",
  },
  {
    key: "monitorAllowPrivateTargets", group: "monitoring", kind: "boolean", default: false, env: "MONITOR_ALLOW_PRIVATE_TARGETS",
    label: "Monitor private network targets",
    help: "Let monitors check addresses on private networks (internal services). Off blocks them, which protects against server-side request forgery. Webhooks and notifications always stay blocked.",
  },
  {
    key: "monitorEnableIcmp", group: "monitoring", kind: "boolean", default: false, env: "MONITOR_ENABLE_ICMP",
    label: "Ping (ICMP) monitors",
    help: "Allow monitors that send a ping. Needs the ping tool on the server (the image includes it).",
  },
  {
    key: "monitorMaxResponseBytes", group: "monitoring", kind: "integer", default: 1_048_576, min: 1024, max: 100 * 1024 * 1024, unit: "bytes", env: "MONITOR_MAX_RESPONSE_BYTES",
    label: "Largest response a monitor reads",
    help: "HTTP checks stop reading a response after this many bytes.",
  },
  {
    key: "workerMonitorSweepMs", group: "worker", kind: "integer", default: 1000, min: 200, max: 60000, unit: "ms", env: "WORKER_MONITOR_SWEEP_MS",
    label: "How often to look for monitors that are due",
    help: "How often to look for monitors that are due. Lower finds due checks sooner and uses more database queries. Applies on the next round, no restart.",
  },
  {
    key: "workerMonitorConcurrency", group: "worker", kind: "integer", default: 20, min: 1, max: 200, unit: "checks", env: "WORKER_MONITOR_CONCURRENCY",
    label: "Monitor checks run at once",
    help: "Monitor checks run at once. Raise for many monitors; each check holds a connection open while it runs. Applies on the next round, no restart.",
  },
  {
    key: "workerNotificationSweepMs", group: "worker", kind: "integer", default: 1000, min: 200, max: 60000, unit: "ms", env: "WORKER_NOTIFICATION_SWEEP_MS",
    label: "How often to send notifications",
    help: "How often to send notifications. Applies on the next round, no restart.",
  },
  {
    key: "workerNotificationBatch", group: "worker", kind: "integer", default: 25, min: 1, max: 500, unit: "messages", env: "WORKER_NOTIFICATION_BATCH",
    label: "Notifications sent per round",
    help: "Notifications sent per round. Applies on the next round, no restart.",
  },
  {
    key: "workerExportSweepMs", group: "worker", kind: "integer", default: 5000, min: 500, max: 300000, unit: "ms", env: "WORKER_EXPORT_SWEEP_MS",
    label: "How often to look for data exports",
    help: "How often to look for data exports. Applies on the next round, no restart.",
  },
  {
    key: "workerAuditDeliverySweepMs", group: "worker", kind: "integer", default: 2000, min: 500, max: 300000, unit: "ms", env: "WORKER_AUDIT_DELIVERY_SWEEP_MS",
    label: "How often to deliver audit events",
    help: "How often to deliver audit events. Applies on the next round, no restart.",
  },
  {
    key: "workerAuditDeliveryBatch", group: "worker", kind: "integer", default: 25, min: 1, max: 500, unit: "events", env: "WORKER_AUDIT_DELIVERY_BATCH",
    label: "Audit events delivered per round",
    help: "Audit events delivered per round. Applies on the next round, no restart.",
  },
  {
    key: "workerPlatformJobSweepMs", group: "worker", kind: "integer", default: 5000, min: 500, max: 300000, unit: "ms", env: "WORKER_PLATFORM_JOB_SWEEP_MS",
    label: "How often to run platform jobs",
    help: "How often to run platform jobs. Applies on the next round, no restart.",
  },
  {
    key: "workerPlatformJobBatch", group: "worker", kind: "integer", default: 1, min: 1, max: 20, unit: "jobs", env: "WORKER_PLATFORM_JOB_BATCH",
    label: "Platform jobs run per round",
    help: "Platform jobs run per round. Applies on the next round, no restart.",
  },
  {
    key: "workerMaintenanceSweepMs", group: "worker", kind: "integer", default: 10000, min: 1000, max: 600000, unit: "ms", env: "WORKER_MAINTENANCE_SWEEP_MS",
    label: "How often to run maintenance",
    help: "How often to run maintenance. Scheduled maintenance windows start and end within this long of their time. Applies on the next round, no restart.",
  },
] as const satisfies readonly SettingDefinition[];

export type SettingKey = (typeof SETTINGS)[number]["key"];

/** The value type of each setting, for typed accessors. */
export type SettingValues = {
  publicUrl: string | null;
  secureCookies: "auto" | "always";
  hsts: "auto" | "on" | "off";
  adminCidrs: string[];
  sessionIdleSeconds: number;
  sessionAbsoluteSeconds: number;
  passwordMinLength: number;
  mfaEnabled: boolean;
  monitorAllowPrivateTargets: boolean;
  monitorEnableIcmp: boolean;
  monitorMaxResponseBytes: number;
  workerMonitorSweepMs: number;
  workerMonitorConcurrency: number;
  workerNotificationSweepMs: number;
  workerNotificationBatch: number;
  workerExportSweepMs: number;
  workerAuditDeliverySweepMs: number;
  workerAuditDeliveryBatch: number;
  workerPlatformJobSweepMs: number;
  workerPlatformJobBatch: number;
  workerMaintenanceSweepMs: number;
};

export function settingDefinition(key: SettingKey): SettingDefinition {
  return SETTINGS.find((item) => item.key === key) as SettingDefinition;
}

export type ParseResult = { ok: true; value: SettingValue } | { ok: false; error: string };
const fail = (error: string): ParseResult => ({ ok: false, error });

/** A plain http(s) base address: no credentials, query or fragment; trailing slash removed. */
function parseUrl(raw: unknown): ParseResult {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return fail("Enter a web address");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return fail("Enter a full web address such as https://status.example.com");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return fail("The address must start with http:// or https://");
  if (url.username || url.password) return fail("The address cannot contain a username or password");
  if (url.search || url.hash) return fail("The address cannot contain a query or fragment");
  return { ok: true, value: `${url.origin}${url.pathname}`.replace(/\/+$/, "") };
}

/** Validates a value coming from the admin form or the database. */
export function parseValue(definition: SettingDefinition, raw: unknown): ParseResult {
  switch (definition.kind) {
    case "boolean":
      return typeof raw === "boolean" ? { ok: true, value: raw } : fail("Must be on or off");
    case "integer":
      if (typeof raw !== "number" || !Number.isInteger(raw)) return fail("Must be a whole number");
      if (raw < definition.min || raw > definition.max) return fail(`Must be between ${definition.min} and ${definition.max}`);
      return { ok: true, value: raw };
    case "enum":
      return typeof raw === "string" && definition.options.some((option) => option.value === raw)
        ? { ok: true, value: raw }
        : fail(`Must be one of: ${definition.options.map((option) => option.value).join(", ")}`);
    case "url":
      return parseUrl(raw);
    case "cidrs": {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) return fail("Must be a list of network ranges");
      const { cidrs, invalid } = parseCidrs(raw as string[]);
      return invalid.length ? fail(`Not valid network ranges: ${invalid.join(", ")}`) : { ok: true, value: cidrs };
    }
  }
}

/** Reads an environment variable the way the old code did: numbers are clamped, anything unreadable is rejected. */
export function parseEnvValue(definition: SettingDefinition, raw: string): ParseResult {
  const text = raw.trim();
  switch (definition.kind) {
    case "boolean":
      return text === "true" ? { ok: true, value: true } : text === "false" ? { ok: true, value: false } : fail("Use true or false");
    case "integer": {
      const number = Number(text);
      if (!text || !Number.isFinite(number)) return fail("Use a number");
      return { ok: true, value: Math.min(definition.max, Math.max(definition.min, Math.trunc(number))) };
    }
    case "enum":
      return parseValue(definition, text.toLowerCase());
    case "url":
      return parseUrl(text);
    case "cidrs":
      return parseValue(definition, text.split(/[\s,]+/).filter(Boolean));
  }
}
