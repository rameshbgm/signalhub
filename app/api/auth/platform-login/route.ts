import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: { code: "PLATFORM_LOGIN_RETIRED", message: "Use the unified Admin login." } },
    { status: 410 }
  );
}
