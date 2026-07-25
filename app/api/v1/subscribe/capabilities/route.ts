import { NextResponse } from "next/server";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";

export async function GET() {
  return NextResponse.json(await subscriptionCapabilities(), {
    headers: { "cache-control": "no-store" },
  });
}
