import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { apiError, routeError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    await consumeRateLimit("identity-connection-discovery", requestIp(request), {
      limit: 60,
      windowMs: 15 * 60_000,
    });
    const connections = await collections
      .identityConnections()
      .find({ enabled: true, audience: "ORGANIZATION" }, { projection: { name: 1, slug: 1, type: 1 } })
      .sort({ name: 1 })
      .toArray();
    return NextResponse.json({
      connections: connections.map((connection) => ({
        name: connection.name,
        slug: connection.slug,
        type: connection.type,
        startUrl: `/api/auth/${connection.type.toLowerCase()}/${encodeURIComponent(connection.slug)}/start`,
      })),
    });
  } catch (error) {
    if (error instanceof RateLimitError) return apiError(429, "RATE_LIMITED", "Too many requests");
    return routeError(error);
  }
}
