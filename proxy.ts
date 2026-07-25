import { NextRequest, NextResponse } from "next/server";
import { decodeProtectedHeader, jwtVerify } from "jose";
import { getSessionSigningKeys } from "@/lib/session-secret";
import { isPublicPlatformRoute } from "@/lib/proxy-route-policy";

async function verifySession(token: string, audience: "org" | "platform") {
  const { all } = getSessionSigningKeys();
  const kid = decodeProtectedHeader(token).kid;
  const candidates = kid ? all.filter((key) => key.id === kid) : all;
  for (const candidate of candidates) {
    try {
      await jwtVerify(token, candidate.secret, { audience });
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

// Hosts that serve the app itself (admin, marketing, slug-based status pages).
// Anything else is treated as a tenant's custom domain.
function isAppHost(host: string) {
  const appHost = (process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localhost").toLowerCase();
  return host === appHost || host === `www.${appHost}` || host === "localhost" || host === "127.0.0.1";
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();

  // Custom-domain routing: rewrite the root of an unknown host to the
  // domain-resolver route, which looks up the page by customDomain in Mongo
  // (middleware runs on the edge runtime, so the DB lookup can't happen here).
  if (host && !isAppHost(host) && !pathname.startsWith("/_next") && !pathname.startsWith("/api")) {
    const url = req.nextUrl.clone();
    if (pathname === "/") url.pathname = `/custom-domain/${host}`;
    else if (pathname === "/history") url.pathname = `/custom-domain/${host}/history`;
    else if (pathname === "/access") url.pathname = `/custom-domain/${host}/access`;
    else if (pathname.startsWith("/incidents/")) {
      url.pathname = `/custom-domain/${host}${pathname}`;
    } else if (pathname === "/feed/rss" || pathname === "/feed/atom") {
      url.pathname = `/custom-domain/${host}${pathname}`;
    } else {
      return new NextResponse("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return NextResponse.rewrite(url);
  }

  if (pathname === "/admin/login") return nextWithRequestId(req);

  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get("sp_session")?.value;
    if (!token) return NextResponse.redirect(new URL("/admin/login", req.url));
    try {
      await verifySession(token, "org");
      return nextWithRequestId(req);
    } catch {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
  }

  if (isPublicPlatformRoute(pathname)) return nextWithRequestId(req);

  if (pathname.startsWith("/platform")) {
    const token = req.cookies.get("sp_platform_session")?.value;
    if (!token) return NextResponse.redirect(new URL("/platform/login", req.url));
    try {
      await verifySession(token, "platform");
      return nextWithRequestId(req);
    } catch {
      return NextResponse.redirect(new URL("/platform/login", req.url));
    }
  }

  return nextWithRequestId(req);
}

export const config = {
  // Development's Webpack HMR WebSocket is served by Next itself. Routing it
  // through the custom-domain/auth proxy turns the upgrade request into a
  // normal page request, leaving client components unhydrated.
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
