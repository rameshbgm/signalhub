import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: { code: "SUPPORT_SESSION_RETIRED", message: "Admins switch organizations directly." } },
    { status: 410 }
  );
}
