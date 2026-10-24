import { NextRequest, NextResponse } from "next/server";
import { subscriptionCapabilities } from "@/lib/notification-capabilities";
import { getPublicPageBySlug } from "@/lib/pages";
import { checkPageAccess } from "@/lib/access";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("pageSlug");
  const page = slug ? await getPublicPageBySlug(slug) : null;
  if (slug && (!page || !(await checkPageAccess(page)).ok)) {
    return NextResponse.json({ error: "Page not found" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json(await subscriptionCapabilities(page?.id), {
    headers: { "cache-control": "no-store" },
  });
}
