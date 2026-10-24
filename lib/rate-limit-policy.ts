import { safeMode, storedSettings, type SettingSource, type StoredSettings } from "@/lib/settings/effective";

/**
 * Every rate limit in one catalogue: what it protects, its default (the number that
 * used to be written at the call site, so upgrading changes nothing) and the range
 * an administrator may move it within. The floors keep protection from being
 * switched off; the ceilings keep a typo from making a limit meaningless.
 *
 * Pure: counters live in the database (lib/rate-limit.ts); this only decides the numbers.
 */
export type LimiterScope = "ip" | "account" | "contact" | "token";
export type Limiter = {
  id: string;
  label: string;
  protects: string;
  /** What the counter is keyed by. Presets scale only per-address ("ip") limits. */
  scope: LimiterScope;
  limit: number;
  windowSeconds: number;
  minLimit: number;
  maxLimit: number;
};

const MIN_WINDOW_SECONDS = 10;
const MAX_WINDOW_SECONDS = 24 * 3600;
const L = (
  id: string, label: string, protects: string, scope: LimiterScope,
  limit: number, windowSeconds: number, minLimit: number, maxLimit: number,
): Limiter => ({ id, label, protects, scope, limit, windowSeconds, minLimit, maxLimit });

export const LIMITERS = [
  L("login-ip", "Sign-in attempts per address", "Password guessing from one address", "ip", 20, 900, 5, 500),
  L("login-account", "Sign-in attempts per account", "Password guessing against one account", "account", 8, 900, 3, 50),
  L("mfa-ip", "Authenticator code attempts per address", "Guessing authenticator or recovery codes", "ip", 30, 900, 5, 300),
  L("mfa-account", "Authenticator actions per account", "Guessing codes through the security settings", "account", 15, 900, 3, 100),
  L("mfa-request-ip", "MFA removal requests per address", "Flooding administrators and owners with requests", "ip", 5, 3600, 1, 50),
  L("mfa-request-account", "MFA removal requests per account", "Flooding one person with request emails", "account", 3, 3600, 1, 20),
  L("password-reset-ip", "Password reset requests per address", "Email flooding through the reset form", "ip", 10, 900, 3, 100),
  L("password-reset-account", "Password reset requests per account", "Email flooding of one person", "account", 3, 3600, 1, 20),
  L("password-reset-submit", "Password reset submissions per address", "Guessing reset tokens", "ip", 10, 900, 3, 100),
  L("accept-invite-ip", "Invitation acceptances per address", "Guessing invitation links", "ip", 20, 900, 5, 300),
  L("accept-invite-token", "Attempts per invitation link", "Guessing one invitation", "token", 8, 900, 3, 50),
  L("oidc-start", "Single sign-on starts per address", "Flooding the identity provider", "ip", 20, 900, 5, 300),
  L("enterprise-oidc-start", "Organization single sign-on starts per address", "Flooding the identity provider", "ip", 20, 900, 5, 300),
  L("saml-start", "SAML sign-in starts per address", "Flooding the identity provider", "ip", 20, 900, 5, 300),
  L("identity-connection-discovery", "Sign-in method lookups per address", "Enumerating organizations", "ip", 60, 900, 10, 600),
  L("page-access", "Private page password attempts per address", "Guessing a status page password", "ip", 10, 900, 3, 100),
  L("otp-verify", "Subscriber code checks per address", "Guessing subscription codes", "ip", 30, 900, 5, 300),
  L("subscription-ip", "Subscriber code requests per address", "Email and SMS flooding", "ip", 10, 3600, 2, 200),
  L("subscription-contact", "Subscriber code requests per contact", "Flooding one email or phone number", "contact", 5, 3600, 1, 50),
  L("public-status", "Public status reads per address", "Scraping and load on a status page", "ip", 300, 60, 30, 6000),
  L("public-metric-window", "Public metric reads per address", "Scraping charts", "ip", 120, 60, 20, 3000),
  L("analytics", "Page view events per address", "Faking visitor statistics", "ip", 120, 3600, 20, 5000),
  L("heartbeat-ip", "Heartbeat requests per address", "Excessive heartbeat lookups and writes", "ip", 1200, 60, 60, 120000),
  L("heartbeat-monitor", "Heartbeat updates per monitor", "Excessive updates to one monitor", "token", 120, 60, 10, 6000),
  L("automation", "Component automation calls per address", "Abuse of automation tokens", "ip", 120, 60, 10, 6000),
] as const satisfies readonly Limiter[];

export type LimiterId = (typeof LIMITERS)[number]["id"];
export type RateLimitValue = { limit: number; windowSeconds: number };
export type RateLimitOverrides = Partial<Record<LimiterId, RateLimitValue>>;
type Env = Record<string, string | undefined>;

const byId = new Map<string, Limiter>(LIMITERS.map((limiter) => [limiter.id, limiter]));

/** RATE_LIMIT_LOGIN_IP="20/900" means 20 attempts per 900 seconds. */
export const limiterEnvName = (id: string) => `RATE_LIMIT_${id.toUpperCase().replace(/-/g, "_")}`;

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(value)));

function valid(limiter: Limiter, raw: unknown): RateLimitValue | null {
  if (!raw || typeof raw !== "object") return null;
  const { limit, windowSeconds } = raw as Record<string, unknown>;
  if (typeof limit !== "number" || typeof windowSeconds !== "number" || !Number.isInteger(limit) || !Number.isInteger(windowSeconds)) return null;
  if (limit < limiter.minLimit || limit > limiter.maxLimit || windowSeconds < MIN_WINDOW_SECONDS || windowSeconds > MAX_WINDOW_SECONDS) return null;
  return { limit, windowSeconds };
}

export type ResolvedLimit = { limit: number; windowMs: number; source: SettingSource; default: RateLimitValue; invalid?: string };

/** The numbers in force for one limiter. Never throws: anything unreadable falls back to the default. */
export function resolveLimit(id: LimiterId, env: Env = process.env, stored: StoredSettings = storedSettings()): ResolvedLimit {
  const limiter = byId.get(id)!;
  const fallback: RateLimitValue = { limit: limiter.limit, windowSeconds: limiter.windowSeconds };
  const done = (value: RateLimitValue, source: SettingSource, invalid?: string): ResolvedLimit =>
    ({ limit: value.limit, windowMs: value.windowSeconds * 1000, source, default: fallback, ...(invalid ? { invalid } : {}) });

  const raw = env[limiterEnvName(id)]?.trim();
  let invalid: string | undefined;
  if (raw) {
    const match = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (match) {
      return done({
        limit: clampInt(Number(match[1]), limiter.minLimit, limiter.maxLimit),
        windowSeconds: clampInt(Number(match[2]), MIN_WINDOW_SECONDS, MAX_WINDOW_SECONDS),
      }, "environment");
    }
    invalid = `${limiterEnvName(id)} is ignored: use limit/seconds, for example 20/900`;
  }
  if (!safeMode(env)) {
    const saved = (stored.rateLimits as Record<string, unknown> | undefined)?.[id];
    if (saved !== undefined) {
      const parsed = valid(limiter, saved);
      if (parsed) return done(parsed, "admin", invalid);
      invalid = "The saved value is ignored: it is outside the allowed range";
    }
  }
  return done(fallback, "default", invalid);
}

export type ParsedRateLimits = { ok: true; value: RateLimitOverrides } | { ok: false; errors: string[] };

/** Validates what the admin form submits, naming every problem. */
export function parseRateLimits(raw: unknown): ParsedRateLimits {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["Rate limits must be an object"] };
  const errors: string[] = [];
  const value: Record<string, RateLimitValue> = {};
  for (const [id, entry] of Object.entries(raw)) {
    const limiter = byId.get(id);
    if (!limiter) { errors.push(`${id} is not a known limit`); continue; }
    const parsed = valid(limiter, entry);
    if (parsed) { value[id] = parsed; continue; }
    const { limit, windowSeconds } = (entry ?? {}) as Record<string, unknown>;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < limiter.minLimit || limit > limiter.maxLimit) errors.push(`${id}: the limit must be a whole number from ${limiter.minLimit} to ${limiter.maxLimit}`);
    if (typeof windowSeconds !== "number" || !Number.isInteger(windowSeconds) || windowSeconds < MIN_WINDOW_SECONDS || windowSeconds > MAX_WINDOW_SECONDS) errors.push(`${id}: the window must be from ${MIN_WINDOW_SECONDS} seconds to 24 hours`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: value as RateLimitOverrides };
}

export type RateLimitPreset = "standard" | "relaxed" | "strict";
const FACTOR: Record<Exclude<RateLimitPreset, "standard">, number> = { relaxed: 5, strict: 0.5 };

/**
 * Standard clears every override. Relaxed (many visitors behind one shared address, such as a
 * school or office) and Strict scale only the per-address limits; per-account and per-token
 * limits protect individuals and are left alone.
 */
export function presetRateLimits(preset: RateLimitPreset): RateLimitOverrides {
  if (preset === "standard") return {};
  const result: Record<string, RateLimitValue> = {};
  for (const limiter of LIMITERS) {
    if (limiter.scope !== "ip") continue;
    result[limiter.id] = { limit: clampInt(Math.round(limiter.limit * FACTOR[preset]), limiter.minLimit, limiter.maxLimit), windowSeconds: limiter.windowSeconds };
  }
  return result as RateLimitOverrides;
}
