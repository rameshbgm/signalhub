import { NextResponse, type NextRequest } from "next/server";
import { writeRuntimeConfig } from "@/lib/setup/config-file";
import { testDatabase } from "@/lib/setup/database-check";
import { databaseInputFromRequest } from "@/lib/setup/database-request";
import { guardSetupRequest, readJson, reloadAfterResponse, setupError } from "@/lib/setup/http";

function publicUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const denied = guardSetupRequest(request, "db");
  if (denied) return denied;
  const body = await readJson<{ connection?: unknown; appUrl?: unknown; confirmUnrelatedTables?: unknown }>(request);
  const appUrl = publicUrl(body?.appUrl);
  if (!appUrl) return setupError(400, "SETUP_INVALID_APP_URL", "Enter the public URL people will use, starting with https:// or http://.");
  const input = databaseInputFromRequest(body?.connection);
  if (typeof input === "string") return setupError(400, "SETUP_INVALID_DATABASE", input);

  // Re-test server-side: the saved configuration must be one that works now.
  const result = await testDatabase(input);
  if (!result.ok || !result.url) {
    return setupError(422, "SETUP_DATABASE_FAILED", "The database check failed.", { checks: result.checks });
  }
  if (result.needsConfirmation && body?.confirmUnrelatedTables !== true) {
    return setupError(409, "SETUP_DATABASE_NOT_EMPTY", "Confirm that SignalHub may share this database.", { checks: result.checks });
  }

  await writeRuntimeConfig({
    DATABASE_URL: result.url,
    ...(result.ca ? { DATABASE_SSL_CA: result.ca } : {}),
    // The environment still wins if the operator sets it later.
    ...(process.env.NEXT_PUBLIC_APP_URL ? {} : { NEXT_PUBLIC_APP_URL: appUrl }),
  });
  reloadAfterResponse();
  return NextResponse.json({ saved: true });
}
