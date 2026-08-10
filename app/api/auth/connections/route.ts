import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/postgres/client";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { apiError, routeError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    await consumeRateLimit("identity-connection-discovery", requestIp(request), {
      limit: 60,
      windowMs: 15 * 60_000,
    });
    const connections = await database.selectFrom("identityConnections").select(["name", "slug", "type"])
      .where("enabled", "=", true).where("audience", "=", "ORGANIZATION").orderBy("name", "asc").execute();
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
    return routeError(error, { route: "GET /api/auth/connections" });
  }
}
