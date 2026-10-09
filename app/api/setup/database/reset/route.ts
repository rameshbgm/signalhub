import { NextResponse, type NextRequest } from "next/server";
import { removeRuntimeConfigKeys, setFromEnvironment } from "@/lib/setup/config-file";
import { guardSetupRequest, reloadAfterResponse, setupError } from "@/lib/setup/http";

/**
 * "Use a different database" in the administrator step: forgets the
 * connection the wizard saved and returns to the database step. Data in that
 * database is untouched. Only while no administrator exists, and never for a
 * database the operator configured through environment variables.
 */
export async function POST(request: NextRequest) {
  const denied = guardSetupRequest(request, "admin");
  if (denied) return denied;
  if (setFromEnvironment("DATABASE_URL")) {
    return setupError(409, "SETUP_DATABASE_FROM_ENVIRONMENT", "The database is set with the DATABASE_URL environment variable. Change it there and restart.");
  }
  const { countUsers } = await import("@/lib/setup/admin");
  if (await countUsers() > 0) return setupError(409, "SETUP_ALREADY_COMPLETE", "Setup is already complete.");
  await removeRuntimeConfigKeys(["DATABASE_URL", "DATABASE_SSL_CA"]);
  reloadAfterResponse();
  return NextResponse.json({ reset: true });
}
