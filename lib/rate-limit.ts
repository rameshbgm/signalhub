import { sql } from "kysely";
import { database } from "@/lib/postgres/client";
import { hashSecret } from "@/lib/secrets";
import { trustedClientIp } from "@/lib/network-policy";
import { LIMITERS, resolveLimit, type LimiterId } from "@/lib/rate-limit-policy";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests");
  }
}

export function requestIp(request: Request) {
  return trustedClientIp(request.headers);
}

export async function consumeRateLimit(
  scope: string,
  identifier: string,
  options: { limit: number; windowMs: number }
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + options.windowMs);
  const id = `${scope}:${hashSecret(identifier).slice(0, 32)}`;

  const result = await database
    .insertInto("rateLimits")
    .values({ id, count: 1, windowStartedAt: now, expiresAt })
    .onConflict((conflict) => conflict.column("id").doUpdateSet({
      count: sql<number>`case when rate_limits.expires_at > ${now} then rate_limits.count + 1 else 1 end`,
      windowStartedAt: sql<Date>`case when rate_limits.expires_at > ${now} then rate_limits.window_started_at else ${now} end`,
      expiresAt: sql<Date>`case when rate_limits.expires_at > ${now} then rate_limits.expires_at else ${expiresAt} end`,
    }))
    .returningAll()
    .executeTakeFirstOrThrow();

  if (result.count > options.limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((result.expiresAt.getTime() - now.getTime()) / 1000)));
  }
  return {
    remaining: Math.max(0, options.limit - result.count),
    resetAt: result.expiresAt,
  };
}

/**
 * A limit from the catalogue (lib/rate-limit-policy.ts), resolved on every call so an
 * administrator's change applies to the very next request. The counter's name is the
 * limit's id plus an optional suffix, exactly as before the catalogue existed.
 */
export async function consumeNamedLimit(id: LimiterId, identifier: string, suffix?: string) {
  const { limit, windowMs } = resolveLimit(id);
  // Per-address budgets must span all caller-chosen resources; suffixes otherwise
  // let unknown page names create unlimited fresh counters from the same address.
  const scopedSuffix = LIMITERS.find((limiter) => limiter.id === id)?.scope === "ip" ? undefined : suffix;
  return consumeRateLimit(scopedSuffix ? `${id}:${scopedSuffix}` : id, identifier, { limit, windowMs });
}
