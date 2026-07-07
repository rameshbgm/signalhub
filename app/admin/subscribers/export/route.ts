import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pageId = req.nextUrl.searchParams.get("pageId");
  if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });

  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page || page.orgId !== session.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const subscribers = await prisma.subscriber.findMany({ where: { pageId } });
  const rows = ["channel,contact,verified,quarantined,created_at"];
  for (const s of subscribers) {
    rows.push([s.channel, s.contact, s.verified, s.quarantined, s.createdAt.toISOString()].join(","));
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="subscribers-${page.slug}.csv"`,
    },
  });
}
