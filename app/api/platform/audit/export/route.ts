import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { routeError } from "@/lib/api-response";
import { csvField as csv } from "@/lib/csv";

const EXPORT_LIMIT = 100_000;

export async function GET(request: NextRequest) {
  try {
    await requirePlatformCapability("audit.read");
    const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
    // Keep the newest entries when the log exceeds the cap, then restore chronological order.
    const newest = await database.selectFrom("platformAuditLogs").selectAll()
      .orderBy("createdAt", "desc").orderBy("id", "desc").limit(EXPORT_LIMIT + 1).execute();
    const truncated = newest.length > EXPORT_LIMIT;
    const entries = newest.slice(0, EXPORT_LIMIT).reverse();
    const body = format === "json"
      ? JSON.stringify({
          manifest: { format: "signalhub-platform-audit-export", version: 1, generatedAt: new Date().toISOString(), truncated },
          entries,
        })
      : [
          "id,createdAt,actorEmail,actorRole,action,targetType,targetId,organizationId,reason,metadata",
          ...entries.map((entry) => [
            entry.id,
            entry.createdAt.toISOString(),
            entry.actorEmail,
            entry.actorRole,
            entry.action,
            entry.targetType,
            entry.targetId,
            entry.organizationId ?? "",
            entry.reason ?? "",
            entry.metadata ?? {},
          ].map(csv).join(",")),
        ].join("\n");
    const checksum = createHash("sha256").update(body).digest("hex");
    return new NextResponse(body, {
      headers: {
        "content-type": format === "json" ? "application/json" : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="platform-audit.${format}"`,
        "x-content-sha256": checksum,
        "x-export-truncated": String(truncated),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return routeError(error, { route: "GET /api/platform/audit/export" });
  }
}
