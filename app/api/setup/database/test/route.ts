import { NextResponse, type NextRequest } from "next/server";
import { testDatabase } from "@/lib/setup/database-check";
import { databaseInputFromRequest } from "@/lib/setup/database-request";
import { guardSetupRequest, readJson, setupError } from "@/lib/setup/http";

export async function POST(request: NextRequest) {
  const denied = guardSetupRequest(request, "db");
  if (denied) return denied;
  const input = databaseInputFromRequest(await readJson(request));
  if (typeof input === "string") return setupError(400, "SETUP_INVALID_DATABASE", input);
  const result = await testDatabase(input);
  // Never echo the URL back: it contains the password.
  return NextResponse.json({ ok: result.ok, needsConfirmation: result.needsConfirmation, checks: result.checks });
}
