import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: { code: "SIGNUP_RETIRED", message: "Public signup is disabled. An Admin must create organizations and users." } },
    { status: 410 }
  );
}
