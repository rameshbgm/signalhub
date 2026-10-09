import { NextRequest, NextResponse } from "next/server";
import { decodeProtectedHeader, jwtVerify } from "jose";
import { getSessionSigningKeys } from "@/lib/session-secret";

async function verifySession(token: string) {
  const { all } = getSessionSigningKeys();
  const kid = decodeProtectedHeader(token).kid;
  const candidates = kid ? all.filter((key) => key.id === kid) : all;
  for (const candidate of candidates) {
    try {
      await jwtVerify(token, candidate.secret, { audience: "org" });
      return;
    } catch {
      // Continue through the rotation keyring.
    }
  }
  throw new Error("Invalid session");
}

function nextWithRequestId(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-request-id", req.headers.get("x-request-id") || crypto.randomUUID());
  return NextResponse.next({ request: { headers } });
}

/**
 * First-run setup mode (set by dist-runtime/start.mjs): no database yet, or no
 * administrator. Only the wizard, its API, liveness and static files are
 * served; everything else would need a database the process does not have.
 */
function setupGate(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // No icon is configured yet and /favicon.ico would otherwise reach the
  // database-backed public page route.
  if (pathname === "/favicon.ico") return new NextResponse(null, { status: 404 });
  if (
    pathname === "/setup" ||
    pathname.startsWith("/api/setup/") ||
    pathname === "/api/health/live" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/__nextjs") || // development overlay
    /\/[^/]+\.[a-z0-9]+$/i.test(pathname)
  ) {
    return nextWithRequestId(req);
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "SETUP_REQUIRED", message: "SignalHub is not set up yet. Open /setup to finish installation." } },
      { status: 503, headers: { "retry-after": "10" } }
    );
  }
  return NextResponse.redirect(new URL("/setup", req.url));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (process.env.SIGNALHUB_SETUP_MODE) return setupGate(req);

  if (pathname === "/login") return nextWithRequestId(req);

  if (pathname === "/admin/login" || pathname === "/organization/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/platform/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/platform" || pathname.startsWith("/platform/")) {
    const canonical = req.nextUrl.clone();
    canonical.pathname = pathname.replace(/^\/platform/, "/organization/platform");
    return NextResponse.redirect(canonical, 308);
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const legacy = req.nextUrl.clone();
    legacy.pathname = pathname.replace(/^\/admin/, "/organization");
    return NextResponse.redirect(legacy);
  }

  if (pathname === "/organization" || pathname.startsWith("/organization/")) {
    const token = req.cookies.get("sp_session")?.value;
    if (!token) {
      const login = new URL("/login", req.url);
      login.searchParams.set("returnTo", `${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
    try {
      await verifySession(token);
      const internal = req.nextUrl.clone();
      internal.pathname = pathname.startsWith("/organization/platform")
        ? pathname.replace(/^\/organization\/platform/, "/platform")
        : pathname.replace(/^\/organization/, "/admin");
      const headers = new Headers(req.headers);
      headers.set("x-request-id", req.headers.get("x-request-id") || crypto.randomUUID());
      return NextResponse.rewrite(internal, { request: { headers } });
    } catch {
      const login = new URL("/login", req.url);
      login.searchParams.set("returnTo", `${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
  }

  return nextWithRequestId(req);
}

export const config = {
  // Development's Webpack HMR WebSocket is served directly by Next.
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr).*)"],
};
