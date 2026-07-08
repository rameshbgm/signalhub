import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await collections.pages().findOne({ slug });
  if (!page) return new NextResponse("", { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const color = page.brandColor;

  const js = `
(function () {
  var STATUS_URL = ${JSON.stringify(`${baseUrl}/api/v1/status/${slug}`)};
  var PAGE_URL = ${JSON.stringify(`${baseUrl}/${slug}`)};
  var BRAND_COLOR = ${JSON.stringify(color)};

  function render(data) {
    var hasActive = (data.active_incidents && data.active_incidents.length > 0) || (data.scheduled_maintenance && data.scheduled_maintenance.length > 0);
    if (!hasActive) return;

    var banner = document.createElement("div");
    banner.setAttribute("id", "statuspage-embed-banner");
    banner.style.cssText = "position:fixed;bottom:16px;right:16px;max-width:320px;background:" + BRAND_COLOR + ";color:#fff;padding:12px 16px;border-radius:8px;font:13px -apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:999999;cursor:pointer;";

    var title = (data.active_incidents[0] || data.scheduled_maintenance[0] || {}).name || data.status.description;
    banner.innerHTML = "<strong>" + data.status.description + "</strong><br/>" + title;
    banner.onclick = function () {
      window.open(PAGE_URL, "_blank");
    };
    document.body.appendChild(banner);
  }

  fetch(STATUS_URL)
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function () {});
})();
`;

  return new NextResponse(js, { headers: { "content-type": "application/javascript; charset=utf-8" } });
}
