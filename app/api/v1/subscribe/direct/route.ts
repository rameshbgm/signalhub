import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "ADMIN_CONFIGURATION_REQUIRED",
        message: "Webhook, Slack, and Teams destinations must be configured by an organization administrator",
      },
    },
    { status: 410 }
  );
}
