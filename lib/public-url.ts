import type { NextRequest } from "next/server";
import type { PageDoc } from "@/lib/db";
import { publicPagePath } from "@/lib/public-path";

export function absolutePublicPageUrl(request: NextRequest, page: PageDoc) {
  const requestHost = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (page.customDomain && requestHost === page.customDomain.toLowerCase()) {
    return request.nextUrl.origin.replace(/\/$/, "");
  }
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  return `${appBase}${publicPagePath(page)}`;
}
