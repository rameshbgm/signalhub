import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { authorizePublicSurface } from "@/lib/feed-access";
import { absolutePublicPageUrl } from "@/lib/public-url";
import { pageDesignFor } from "@/lib/page-design";
import { publicPageFilter } from "@/lib/page-lifecycle";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const page = await collections.pages().findOne(publicPageFilter({ slug }));
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
    var banner = document.createElement("div");
    banner.id = "status-embed-banner";
    banner.setAttribute("role", "status");
    banner.style.cssText = "position:fixed;bottom:16px;right:16px;max-width:320px;background:" + BRAND_COLOR + ";color:#fff;padding:12px 16px;font:13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:999999;cursor:pointer;";
    var strong = document.createElement("strong");
    text(strong, data.status.description);
    banner.appendChild(strong);
    banner.appendChild(document.createElement("br"));
    text(banner, active[0].name || data.status.description);
    banner.onclick = function () { window.open(PAGE_URL, "_blank", "noopener,noreferrer"); };
    document.body.appendChild(banner);
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
