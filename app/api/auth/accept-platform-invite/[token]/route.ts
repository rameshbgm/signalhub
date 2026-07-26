import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "PLATFORM_INVITES_RETIRED",
        message: "Platform invitations are no longer supported; an Admin must create users directly.",
      },
    },
    { status: 410 }
  );
}
