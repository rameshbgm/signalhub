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
  const feedId = absolutePublicPageUrl(request, page);
  const updated = new Date(
    incidents[0]?.latestUpdate?.createdAt ?? incidents[0]?.createdAt ?? page.createdAt
  ).toISOString();
  const entries = incidents
    .map((incident) => {
      const link = `${absolutePublicPageUrl(request, incident.sourcePage)}/incidents/${incident.id}`;
      return `<entry>
<title>${escapeXml(incident.name)}</title>
<link href="${escapeXml(link)}"/>
<id>${escapeXml(link)}</id>
<updated>${new Date(incident.latestUpdate?.createdAt ?? incident.createdAt).toISOString()}</updated>
<summary>${escapeXml(incident.latestUpdate?.body ?? "")}</summary>
</entry>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${escapeXml(page.name)} Incident History</title>
<link href="${escapeXml(feedId)}"/>
<id>${escapeXml(feedId)}</id>
<updated>${updated}</updated>
${entries}
</feed>`;
  return new NextResponse(xml, {
    headers: {
      "content-type": "application/atom+xml; charset=utf-8",
      "cache-control": feedCacheControl(request, page),
      "x-content-type-options": "nosniff",
    },
  });
}
