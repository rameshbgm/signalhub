import { NextRequest, NextResponse } from "next/server";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

function spreadsheetSafe(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvField(value: unknown) {
  return `"${spreadsheetSafe(value).replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const pageId = request.nextUrl.searchParams.get("pageId");
    if (!pageId) return apiError(400, "MISSING_PAGE_ID", "pageId is required");
    const session = await requireCapability("subscriber.manage", pageId);
    await assertPageInOrg(pageId, session.orgId);
    const page = await collections.pages().findOne({
      _id: oid(pageId),
      orgId: oid(session.orgId),
    });
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const subscribers = await collections.subscribers().find({ pageId: page._id }).toArray();
    const rows = [
      ["channel", "contact", "verified", "quarantined", "created_at"].map(csvField).join(","),
      ...subscribers.map((subscriber) =>
        [
          subscriber.channel,
          subscriber.contact,
          subscriber.verified,
          subscriber.quarantined,
          subscriber.createdAt.toISOString(),
        ]
          .map(csvField)
          .join(",")
      ),
    ];
    return new NextResponse(rows.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="subscribers-${page.slug}.csv"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
