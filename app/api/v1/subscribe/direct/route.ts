import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
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

  const page = await collections.pages().findOne({ slug: pageSlug });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  await collections.subscribers().updateOne(
    { pageId: page._id, channel, contact },
    {
      $set: { verified: true, quarantined: false },
      $setOnInsert: {
        _id: new ObjectId(),
        pageId: page._id,
        channel,
        contact,
        componentIds: "[]",
        unsubscribeToken: new ObjectId().toHexString(),
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
