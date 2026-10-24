import { appBaseUrl } from "@/lib/settings/request";
import type { NextRequest } from "next/server";
import type { PageRow } from "@/lib/postgres/schema";
import { publicPagePath } from "@/lib/public-path";

export function absolutePublicPageUrl(request: NextRequest, page: PageRow) {
  const appBase = appBaseUrl(request.nextUrl.origin);
  return `${appBase}${publicPagePath(page)}`;
}
