import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { authorizePublicSurface } from "@/lib/feed-access";
import { escapeXml, feedCacheControl, getFeedIncidents } from "@/lib/feed";
import { absolutePublicPageUrl } from "@/lib/public-url";
import { publicPageFilter } from "@/lib/page-lifecycle";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const page = await collections.pages().findOne(publicPageFilter({ slug }));
  if (!page) return new NextResponse("Not found", { status: 404 });
  const access = await authorizePublicSurface(request, page);
  if (!access.ok) return new NextResponse("Not found", { status: 404 });
  const incidents = await getFeedIncidents(request, page, access.visibleComponentIds);
  const pageUrl = absolutePublicPageUrl(request, page);
  const items = incidents
    .map((incident) => {
      const link = `${absolutePublicPageUrl(request, incident.sourcePage)}/incidents/${incident.id}`;
      return `<item>
<title>${escapeXml(incident.name)}</title>
<link>${escapeXml(link)}</link>
<guid isPermaLink="true">${escapeXml(link)}</guid>
<pubDate>${new Date(incident.latestUpdate?.createdAt ?? incident.createdAt).toUTCString()}</pubDate>
<description>${escapeXml(incident.latestUpdate?.body ?? "")}</description>
</item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${escapeXml(page.name)} Incident History</title>
<link>${escapeXml(pageUrl)}</link>
<description>Incident history for ${escapeXml(page.name)}</description>
${items}
</channel></rss>`;
  return new NextResponse(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": feedCacheControl(request, page),
      "x-content-type-options": "nosniff",
    },
  });
}
