import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getSecret() {
  const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

// Hosts that serve the app itself (admin, marketing, slug-based status pages).
// Anything else is treated as a tenant's custom domain.
function isAppHost(host: string) {
  const appHost = (process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localhost").toLowerCase();
  return host === appHost || host === `www.${appHost}` || host === "localhost" || host === "127.0.0.1";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();

  // Custom-domain routing: rewrite the root of an unknown host to the
  // domain-resolver route, which looks up the page by customDomain in Mongo
  // (middleware runs on the edge runtime, so the DB lookup can't happen here).
  if (host && !isAppHost(host) && !pathname.startsWith("/_next") && !pathname.startsWith("/api")) {
    const url = req.nextUrl.clone();
    // ponytail: only the status page root is served on custom domains;
    // history/incident permalinks link back to the app domain. Extend the
    // rewrite to map sub-paths if tenants need fully-branded deep links.
    if (pathname === "/") {
      url.pathname = `/custom-domain/${host}`;
      return NextResponse.rewrite(url);
    }
  }

  if (pathname === "/admin/login") return NextResponse.next();

  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get("sp_session")?.value;
    if (!token) return NextResponse.redirect(new URL("/admin/login", req.url));
    try {
      await jwtVerify(token, getSecret());
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
