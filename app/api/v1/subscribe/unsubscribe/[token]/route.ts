import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sub = await collections.subscribers().findOne({ unsubscribeToken: token });
  if (!sub) {
    return new NextResponse("This unsubscribe link is invalid or has already been used.", { status: 404 });
  }
  await collections.subscribers().deleteOne({ _id: sub._id });
  return new NextResponse("You have been unsubscribed and will no longer receive status notifications.", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}
