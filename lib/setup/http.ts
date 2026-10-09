import { NextResponse, type NextRequest } from "next/server";
import { SETUP_RELOAD_EXIT_CODE } from "@/lib/setup/config-file";
import { currentSetupToken, SETUP_COOKIE, setupCookieValid } from "@/lib/setup/token";

// Setup routes run before a database exists, so they must not import
// lib/api-response.ts or anything else that reaches lib/postgres/client.ts.

export type SetupMode = "db" | "admin";

export function currentSetupMode(): SetupMode | null {
  const mode = process.env.SIGNALHUB_SETUP_MODE;
  return mode === "db" || mode === "admin" ? mode : null;
}

export function setupError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Guards every state-changing setup call: the right mode, a valid unlock
 * cookie, and a same-origin request (the cookie is SameSite=Strict, the origin
 * check is belt and braces for older browsers).
 */
export function guardSetupRequest(request: NextRequest, mode: SetupMode) {
  if (currentSetupMode() !== mode) {
    return setupError(409, "SETUP_STEP_UNAVAILABLE", mode === "db"
      ? "The database is already configured."
      : "Administrator setup is not available.");
  }
  const origin = request.headers.get("origin");
  if (origin && originHost(origin) !== request.headers.get("host")) {
    return setupError(403, "SETUP_CROSS_ORIGIN", "Cross-origin setup requests are not allowed.");
  }
  if (!setupUnlocked(request)) {
    return setupError(401, "SETUP_LOCKED", "Enter the setup token first.");
  }
  return null;
}

function originHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return null; // "null" or malformed origins never match
  }
}

export function setupUnlocked(request: NextRequest) {
  return setupCookieValid(request.cookies.get(SETUP_COOKIE)?.value, currentSetupToken());
}

/** Secure cookies over HTTPS, including behind a TLS-terminating proxy we trust. */
export function requestIsHttps(request: NextRequest) {
  if (request.nextUrl.protocol === "https:") return true;
  return process.env.TRUST_PROXY_HEADERS === "true" &&
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

/**
 * Lets the response flush, then asks the supervisor to reload configuration.
 * Signalling the supervisor works whatever sits in between (a Next dev server
 * runs route handlers in a child process); exiting is the fallback.
 */
export function reloadAfterResponse() {
  setTimeout(() => {
    const supervisor = Number(process.env.SIGNALHUB_SUPERVISOR_PID);
    if (supervisor > 0) {
      try {
        process.kill(supervisor, "SIGUSR2");
        return;
      } catch {
        // Not supported (Windows) or the supervisor is gone: fall through.
      }
    }
    process.exit(SETUP_RELOAD_EXIT_CODE);
  }, 300).unref();
}

export async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}
