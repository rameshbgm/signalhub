import { readRequestJson } from "@/lib/request-body";
import { NextResponse, type NextRequest } from "next/server";
import { SETUP_COOKIE, validSetupToken } from "@/lib/setup/token";
import { SETUP_RELOAD_EXIT_CODE } from "@/lib/setup/config-file";

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
 * Guards setup reads and writes by setup mode, operator token and request origin.
 */
export function guardSetupRequest(request: NextRequest, mode: SetupMode) {
  if (currentSetupMode() !== mode) {
    return setupError(409, "SETUP_STEP_UNAVAILABLE", mode === "db"
      ? "The database is already configured."
      : "Administrator setup is not available.");
  }
  const denied = guardSetupOrigin(request);
  if (denied) return denied;
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!validSetupToken(bearer ?? request.cookies.get(SETUP_COOKIE)?.value)) {
    return setupError(401, "SETUP_AUTH_REQUIRED", "Unlock setup with the token from the server startup logs.");
  }
  return null;
}

export function guardSetupOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && originHost(origin) !== request.headers.get("host")) {
    return setupError(403, "SETUP_CROSS_ORIGIN", "Cross-origin setup requests are not allowed.");
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

/** Secure cookies over HTTPS, including behind a TLS-terminating proxy we trust. */
export function requestIsHttps(request: NextRequest) {
  if (request.nextUrl.protocol === "https:" || process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")) return true;
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

export async function readJson<T = unknown>(request: NextRequest): Promise<T | null | Response> {
  const body = await readRequestJson(request);
  if (body instanceof Response) return body;
  return body && typeof body === "object" && !Array.isArray(body) ? body as T : null;
}
