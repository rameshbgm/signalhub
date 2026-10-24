import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { runtimeConfigPath, setFromEnvironment } from "@/lib/setup/config-file";
import { currentSetupMode, guardSetupRequest } from "@/lib/setup/http";

export const dynamic = "force-dynamic";

/** Polled by the wizard while the supervisor reloads; mode null means setup is done. */
export async function GET(request: NextRequest) {
  const mode = currentSetupMode();
  if (mode) {
    const denied = guardSetupRequest(request, mode);
    if (denied) return denied;
  }
  return NextResponse.json({
    mode,
    bundledDatabase: mode === "db" && Boolean(process.env.SIGNALHUB_BUNDLED_DATABASE_URL),
    backupAvailable: mode === "admin" && existsSync(runtimeConfigPath()),
    databaseChangeable: mode === "admin" && !setFromEnvironment("DATABASE_URL"),
  }, { headers: { "cache-control": "no-store" } });
}
