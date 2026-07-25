import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { GET as rss } from "@/app/api/v1/feeds/[slug]/rss/route";
import { GET as atom } from "@/app/api/v1/feeds/[slug]/atom/route";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ domain: string; format: string }> }
) {
  const { domain, format } = await params;
  const page = await collections.pages().findOne({
    customDomain: decodeURIComponent(domain).toLowerCase(),
  });
  if (!page || !["rss", "atom"].includes(format)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const handler = format === "rss" ? rss : atom;
  return handler(request, { params: Promise.resolve({ slug: page.slug }) });
}
