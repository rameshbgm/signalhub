import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  pageSlug: z.string(),
  channel: z.enum(["WEBHOOK", "SLACK"]),
  contact: z.string().url(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { pageSlug, channel, contact } = parsed.data;

  const page = await prisma.page.findUnique({ where: { slug: pageSlug } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  await prisma.subscriber.upsert({
    where: { pageId_channel_contact: { pageId: page.id, channel, contact } },
    update: { verified: true, quarantined: false },
    create: { pageId: page.id, channel, contact, verified: true },
  });

  return NextResponse.json({ ok: true });
}
