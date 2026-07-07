import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  pageSlug: z.string(),
  channel: z.enum(["EMAIL", "SMS"]),
  contact: z.string(),
  code: z.string(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { pageSlug, channel, contact, code } = parsed.data;

  const page = await prisma.page.findUnique({ where: { slug: pageSlug } });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const otp = await prisma.subscriptionOtp.findFirst({
    where: { pageId: page.id, channel, contact, code },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  const componentIds = otp.componentIds;
  await prisma.subscriber.upsert({
    where: { pageId_channel_contact: { pageId: page.id, channel, contact } },
    update: { verified: true, quarantined: false, componentIds },
    create: { pageId: page.id, channel, contact, verified: true, componentIds },
  });

  await prisma.subscriptionOtp.deleteMany({ where: { pageId: page.id, channel, contact } });

  return NextResponse.json({ ok: true });
}
