import { NextResponse, type NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { runtimeConfigPath, setFromEnvironment } from "@/lib/setup/config-file";
import { currentSetupMode, setupUnlocked } from "@/lib/setup/http";

export const dynamic = "force-dynamic";

/** Polled by the wizard while the supervisor reloads; mode null means setup is done. */
export async function GET(request: NextRequest) {
  const mode = currentSetupMode();
  return NextResponse.json({
    mode,
    unlocked: mode !== null && setupUnlocked(request),
    bundledDatabase: mode === "db" && Boolean(process.env.SIGNALHUB_BUNDLED_DATABASE_URL),
    backupAvailable: mode === "admin" && existsSync(runtimeConfigPath()),
    databaseChangeable: mode === "admin" && !setFromEnvironment("DATABASE_URL"),
  }, { headers: { "cache-control": "no-store" } });
}
