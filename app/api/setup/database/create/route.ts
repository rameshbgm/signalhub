import { NextResponse, type NextRequest } from "next/server";
import { createDatabase } from "@/lib/setup/database-check";
import { databaseInputFromRequest } from "@/lib/setup/database-request";
import { guardSetupRequest, readJson, setupError } from "@/lib/setup/http";

/** "Create database" when the connection test found the server but not the database. */
export async function POST(request: NextRequest) {
  const denied = guardSetupRequest(request, "db");
  if (denied) return denied;
  const input = databaseInputFromRequest(await readJson(request));
  if (typeof input === "string") return setupError(400, "SETUP_INVALID_DATABASE", input);
  const result = await createDatabase(input);
  if (!result.ok) return setupError(422, "SETUP_DATABASE_CREATE_FAILED", result.message);
  return NextResponse.json({ created: true });
}
