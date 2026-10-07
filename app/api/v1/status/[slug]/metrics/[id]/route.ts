import { NextRequest, NextResponse } from "next/server";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { checkPageAccess } from "@/lib/access";
import { MAX_WINDOW_MINUTES, MIN_WINDOW_MINUTES } from "@/lib/metric-ranges";
import { getMetricWindowInsight } from "@/lib/metric-series";
import { getPublicPageBySlug } from "@/lib/pages";
import { getMetricsForPage } from "@/lib/public-data";
import { consumeRateLimit, RateLimitError, requestIp } from "@/lib/rate-limit";

/** Chart data for one visible metric over the last ?minutes=N (1 minute to 90 days). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const minutes = Number(request.nextUrl.searchParams.get("minutes"));
    if (!Number.isInteger(minutes) || minutes < MIN_WINDOW_MINUTES || minutes > MAX_WINDOW_MINUTES) {
      return apiError(400, "INVALID_WINDOW", `minutes must be a whole number from ${MIN_WINDOW_MINUTES} to ${MAX_WINDOW_MINUTES}`);
    }
    await consumeRateLimit(`public-metric-window:${slug}`, requestIp(request), { limit: 120, windowMs: 60_000 });
    const page = await getPublicPageBySlug(slug);
    if (!page || !isDatabaseId(id)) return apiError(404, "NOT_FOUND", "Metric not found");
    // The same check the page itself uses, so password-protected and audience pages work from the browser session.
    const access = await checkPageAccess(page);
    if (!access.ok) return apiError(404, "NOT_FOUND", "Metric not found");
    // Same visibility rules as the page: hidden metrics and metrics outside the viewer's component scope are not found.
    const visible = await getMetricsForPage(page.id, access.visibleComponentIds);
    if (!visible.some((metric) => metric.id === id)) return apiError(404, "NOT_FOUND", "Metric not found");
    const response = NextResponse.json(await getMetricWindowInsight(id, minutes));
    response.headers.set("cache-control", page.type === "PUBLIC" ? "public, max-age=15" : "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) {
      const response = apiError(429, "RATE_LIMITED", "Too many chart requests");
      response.headers.set("retry-after", String(error.retryAfterSeconds));
      return response;
    }
    return routeError(error, { route: "GET /api/v1/status/:slug/metrics/:id" });
  }
}
