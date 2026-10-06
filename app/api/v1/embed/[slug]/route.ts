import { NextRequest, NextResponse } from "next/server";
import { authorizePublicSurface } from "@/lib/feed-access";
import { absolutePublicPageUrl } from "@/lib/public-url";
import { pageDesignFor } from "@/lib/page-design";
import { getPublicPageBySlug } from "@/lib/pages";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug);
  if (!page) return new NextResponse("", { status: 404 });
  const access = await authorizePublicSurface(request, page);
  if (!access.ok) return new NextResponse("", { status: 404 });
  const design = pageDesignFor(page);

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  const token = request.nextUrl.searchParams.get("token") ?? request.nextUrl.searchParams.get("feed_token");
  const statusUrl = new URL(`${baseUrl}/api/v1/status/${encodeURIComponent(slug)}`);
  if (token) statusUrl.searchParams.set("token", token);
  const js = `
(function () {
  var STATUS_URL = ${JSON.stringify(statusUrl.toString())};
  var PAGE_URL = ${JSON.stringify(absolutePublicPageUrl(request, page))};
  var BRAND_COLOR = ${JSON.stringify(design.theme.palette.brand)};
  function text(node, value) { node.appendChild(document.createTextNode(value)); }
  function render(data) {
    var active = [].concat(data.active_incidents || [], data.active_maintenance || []);
    if (!active.length) return;
    var region = document.createElement("div");
    region.id = "status-embed-banner";
    region.setAttribute("role", "status");
    region.style.cssText = "position:fixed;bottom:16px;right:16px;max-width:320px;z-index:999999;";
    var link = document.createElement("a");
    link.href = PAGE_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.cssText = "display:block;background:" + BRAND_COLOR + ";color:#fff;padding:12px 16px;font:13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2);text-decoration:none;";
    var strong = document.createElement("strong");
    text(strong, data.status.description);
    link.appendChild(strong);
    link.appendChild(document.createElement("br"));
    text(link, active[0].name || data.status.description);
    region.appendChild(link);
    document.body.appendChild(region);
  }
  fetch(STATUS_URL, { credentials: "omit" })
    .then(function (response) { if (!response.ok) throw new Error("status"); return response.json(); })
    .then(render)
    .catch(function () {});
})();`;
  return new NextResponse(js, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": page.type === "PUBLIC" ? "public, max-age=60" : "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
