import type { NextRequest } from "next/server";
import { collections } from "@/lib/db";
import { hashSecret } from "@/lib/secrets";
import { trustedClientIp } from "@/lib/network-policy";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests");
  }
}

export function requestIp(request: NextRequest) {
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

  const result = await collections.rateLimits().findOneAndUpdate(
    { _id: id },
    [
      {
        $set: {
          count: {
            $cond: [
              { $and: [{ $ne: [{ $type: "$expiresAt" }, "missing"] }, { $gt: ["$expiresAt", now] }] },
              { $add: [{ $ifNull: ["$count", 0] }, 1] },
              1,
            ],
          },
          windowStartedAt: {
            $cond: [
              { $and: [{ $ne: [{ $type: "$expiresAt" }, "missing"] }, { $gt: ["$expiresAt", now] }] },
              "$windowStartedAt",
              now,
            ],
          },
          expiresAt: {
            $cond: [
              { $and: [{ $ne: [{ $type: "$expiresAt" }, "missing"] }, { $gt: ["$expiresAt", now] }] },
              "$expiresAt",
              expiresAt,
            ],
          },
        },
      },
    ],
    { upsert: true, returnDocument: "after" }
  );

  if (result && result.count > options.limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((result.expiresAt.getTime() - now.getTime()) / 1000)));
  }
  return {
    remaining: Math.max(0, options.limit - (result?.count ?? 1)),
    resetAt: result?.expiresAt ?? expiresAt,
  };
}
