import { NextRequest, NextResponse } from "next/server";
import { renderStatusBadge } from "@/lib/badge";
import { collections } from "@/lib/db";
import { authorizePublicSurface } from "@/lib/feed-access";
import {
  getAuthorizedHubChildren,
  getPublicSurfaceSummary,
} from "@/lib/public-surface";
import { COMPONENT_STATUS_COLOR, overallBanner } from "@/lib/status";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const page = await collections.pages().findOne({ slug });
  if (!page) return new NextResponse("", { status: 404 });

  const access = await authorizePublicSurface(request, page);
  if (!access.ok) return new NextResponse("", { status: 404 });

  let label = "No current status data";
  let color = "#64748b";
  let containsProtectedData =
    page.type !== "PUBLIC" ||
    request.headers.has("authorization") ||
    request.nextUrl.searchParams.has("token") ||
    request.nextUrl.searchParams.has("feed_token");

  if (page.isHub) {
    const children = await getAuthorizedHubChildren(request, page);
    containsProtectedData ||= children.some((child) => child.page.type !== "PUBLIC");
    const summaries = await Promise.all(
      children.map((child) =>
        getPublicSurfaceSummary(
          child.page._id.toHexString(),
          child.access.visibleComponentIds
        )
      )
    );
    const statuses = summaries
      .map((summary) => summary.banner?.status)
      .filter((status): status is NonNullable<typeof status> => Boolean(status));
    if (statuses.length) {
      const banner = overallBanner(statuses);
      label = banner.label;
      color = COMPONENT_STATUS_COLOR[banner.status];
    }
  } else {
    const summary = await getPublicSurfaceSummary(
      page._id.toHexString(),
      access.visibleComponentIds
    );
    if (summary.banner) {
      label = summary.banner.label;
      color = COMPONENT_STATUS_COLOR[summary.banner.status];
    }
  }

  return new NextResponse(renderStatusBadge(label, color), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": containsProtectedData
        ? "private, no-store"
        : "public, max-age=30, stale-while-revalidate=30",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}
