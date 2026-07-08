import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { generateOtpCode } from "@/lib/notify";
import { z } from "zod";

const schema = z.object({
  pageSlug: z.string(),
  channel: z.enum(["EMAIL", "SMS"]),
  contact: z.string().min(3),
  componentIds: z.array(z.string()).optional().default([]),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { pageSlug, channel, contact, componentIds } = parsed.data;

  const page = await collections.pages().findOne({ slug: pageSlug });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  if (channel === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (channel === "SMS" && !/^\+\d{6,15}$/.test(contact)) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const code = generateOtpCode();
  await collections.subscriptionOtps().insertOne({
    _id: new ObjectId(),
    pageId: page._id.toHexString(),
    channel,
    contact,
    code,
    componentIds: JSON.stringify(componentIds),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: new Date(),
  });

  // Simulated delivery: the OTP is logged instead of actually sent over SMTP/SMS.
  await collections.notificationLogs().insertOne({
    _id: new ObjectId(),
    pageId: page._id.toHexString(),
    channel,
    contact,
    subject: "Your verification code",
    body: `Your verification code is ${code}. It expires in 10 minutes.`,
    status: "SENT",
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true, devCode: process.env.NODE_ENV !== "production" ? code : undefined });
}
