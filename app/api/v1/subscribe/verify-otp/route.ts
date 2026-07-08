import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
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

  const page = await collections.pages().findOne({ slug: pageSlug });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const otp = await collections
    .subscriptionOtps()
    .find({ pageId: page._id.toHexString(), channel, contact, code })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
  if (!otp || otp.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  const componentIds = otp.componentIds;
  await collections.subscribers().updateOne(
    { pageId: page._id, channel, contact },
    {
      $set: { verified: true, quarantined: false, componentIds },
      $setOnInsert: {
        _id: new ObjectId(),
        pageId: page._id,
        channel,
        contact,
        unsubscribeToken: new ObjectId().toHexString(),
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  await collections.subscriptionOtps().deleteMany({ pageId: page._id.toHexString(), channel, contact });

  return NextResponse.json({ ok: true });
}
