import { NextResponse } from "next/server";
import { destroyPlatformSession } from "@/lib/auth";

export async function POST() {
  await destroyPlatformSession();
  return NextResponse.json({ ok: true });
}
