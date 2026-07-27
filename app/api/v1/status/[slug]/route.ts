import { NextRequest, NextResponse } from "next/server";
import { apiError, routeError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { authorizePublicSurface } from "@/lib/feed-access";
import { buildStatusPayload } from "@/lib/public-api";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { absolutePublicPageUrl } from "@/lib/public-url";
import { publicPageFilter } from "@/lib/page-lifecycle";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    await consumeRateLimit(`public-status:${slug}`, requestIp(request), {
      limit: 300,
      windowMs: 60_000,
    });
    const page = await collections.pages().findOne(publicPageFilter({ slug }));
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const access = await authorizePublicSurface(request, page);
    if (!access.ok) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const response = NextResponse.json(
      await buildStatusPayload(page, access.visibleComponentIds, absolutePublicPageUrl(request, page))
    );
    response.headers.set("cache-control", page.type === "PUBLIC" ? "public, max-age=15" : "private, no-store");
    response.headers.set("access-control-allow-origin", "*");
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many status requests");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error);
  }
}
