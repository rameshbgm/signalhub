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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
