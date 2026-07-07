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
  const entries = incidents
    .map(
      (inc) => `
  <entry>
    <title>${escapeXml(inc.name)}</title>
    <link href="${baseUrl}/${page.slug}/incidents/${inc.id}"/>
    <id>${baseUrl}/${page.slug}/incidents/${inc.id}</id>
    <updated>${new Date(inc.createdAt).toISOString()}</updated>
    <summary>${escapeXml(inc.updates[0]?.body ?? "")}</summary>
  </entry>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(page.name)} Incident History</title>
  <link href="${baseUrl}/${page.slug}"/>
  <id>${baseUrl}/${page.slug}</id>
  <updated>${new Date().toISOString()}</updated>
  ${entries}
</feed>`;

  return new NextResponse(xml, { headers: { "content-type": "application/atom+xml; charset=utf-8" } });
}
