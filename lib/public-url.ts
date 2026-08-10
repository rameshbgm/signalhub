import type { NextRequest } from "next/server";
import type { PageRow } from "@/lib/postgres/schema";
import { publicPagePath } from "@/lib/public-path";

export function absolutePublicPageUrl(request: NextRequest, page: PageRow) {
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  return `${appBase}${publicPagePath(page)}`;
}
