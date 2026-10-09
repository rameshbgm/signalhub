import { readFile } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { runtimeConfigPath } from "@/lib/setup/config-file";
import { guardSetupRequest, setupError } from "@/lib/setup/http";

/**
 * The runtime config holds ENCRYPTION_KEY, so it is offered for download only
 * during setup, to the unlocked operator, and never cached.
 */
export async function GET(request: NextRequest) {
  const denied = guardSetupRequest(request, "admin");
  if (denied) return denied;
  const content = await readFile(runtimeConfigPath(), "utf8").catch(() => null);
  if (!content) return setupError(404, "SETUP_NO_CONFIG", "This installation is configured through environment variables only.");
  return new NextResponse(content, {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="signalhub-config-backup.json"',
      "cache-control": "no-store",
    },
  });
}
