import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await collections.pages().findOne({ slug });
  if (!page) return new NextResponse("Not found", { status: 404 });

  const incidents = await collections.incidents().find({ pageId: page._id }).sort({ createdAt: -1 }).limit(50).toArray();
  const latestUpdates = await Promise.all(
    incidents.map((inc) => collections.incidentUpdates().find({ incidentId: inc._id }).sort({ createdAt: -1 }).limit(1).next())
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const items = incidents
    .map(
      (inc, i) => `
    <item>
      <title>${escapeXml(inc.name)}</title>
      <link>${baseUrl}/${page.slug}/incidents/${inc._id.toHexString()}</link>
      <guid>${baseUrl}/${page.slug}/incidents/${inc._id.toHexString()}</guid>
      <pubDate>${new Date(inc.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(latestUpdates[i]?.body ?? "")}</description>
    </item>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(page.name)} Incident History</title>
    <link>${baseUrl}/${page.slug}</link>
    <description>Incident history for ${escapeXml(page.name)}</description>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
