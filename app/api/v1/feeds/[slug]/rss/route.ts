import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return new NextResponse("Not found", { status: 404 });

  const incidents = await prisma.incident.findMany({
    where: { pageId: page.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { updates: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const items = incidents
    .map(
      (inc) => `
    <item>
      <title>${escapeXml(inc.name)}</title>
      <link>${baseUrl}/${page.slug}/incidents/${inc.id}</link>
      <guid>${baseUrl}/${page.slug}/incidents/${inc.id}</guid>
      <pubDate>${new Date(inc.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(inc.updates[0]?.body ?? "")}</description>
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
