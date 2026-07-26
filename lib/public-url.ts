import type { NextRequest } from "next/server";
import type { PageDoc } from "@/lib/db";
import { publicPagePath } from "@/lib/public-path";

export function absolutePublicPageUrl(request: NextRequest, page: PageDoc) {
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  return `${appBase}${publicPagePath(page)}`;
}
