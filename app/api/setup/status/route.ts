import { NextResponse, type NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { runtimeConfigPath } from "@/lib/setup/config-file";
import { currentSetupMode } from "@/lib/setup/http";
import { SETUP_COOKIE, setupCookieValid } from "@/lib/setup/token";

export const dynamic = "force-dynamic";

/** Polled by the wizard while the supervisor reloads; mode null means setup is done. */
export async function GET(request: NextRequest) {
  const mode = currentSetupMode();
  return NextResponse.json({
    mode,
    unlocked: mode !== null && setupCookieValid(request.cookies.get(SETUP_COOKIE)?.value, process.env.SIGNALHUB_SETUP_TOKEN),
    bundledDatabase: mode === "db" && Boolean(process.env.SIGNALHUB_BUNDLED_DATABASE_URL),
    backupAvailable: mode === "admin" && existsSync(runtimeConfigPath()),
  }, { headers: { "cache-control": "no-store" } });
}
