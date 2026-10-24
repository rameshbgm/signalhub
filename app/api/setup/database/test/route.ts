import { NextResponse, type NextRequest } from "next/server";
import { testDatabase } from "@/lib/setup/database-check";
import { databaseInputFromRequest } from "@/lib/setup/database-request";
import { guardSetupRequest, readJson, setupError } from "@/lib/setup/http";

export async function POST(request: NextRequest) {
  const denied = guardSetupRequest(request, "db");
  if (denied) return denied;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const input = databaseInputFromRequest(body);
  if (typeof input === "string") return setupError(400, "SETUP_INVALID_DATABASE", input);
  const result = await testDatabase(input);
  // Never echo the URL back: it contains the password.
  return NextResponse.json({ ok: result.ok, needsConfirmation: result.needsConfirmation, missingDatabase: result.missingDatabase, checks: result.checks });
}
