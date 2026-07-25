import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { routeError } from "@/lib/api-response";

function csv(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformCapability("audit.read");
    const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
    const entries = await collections.platformAuditLogs().find({})
      .sort({ createdAt: 1 }).limit(100_000).toArray();
    const body = format === "json"
      ? JSON.stringify({
          manifest: { format: "status-platform-audit-export", version: 1, generatedAt: new Date().toISOString() },
          entries,
        })
      : [
          "id,createdAt,actorEmail,actorRole,action,targetType,targetId,organizationId,reason,metadata",
          ...entries.map((entry) => [
            entry._id.toHexString(),
            entry.createdAt.toISOString(),
            entry.actorEmail,
            entry.actorRole,
            entry.action,
            entry.targetType,
            entry.targetId,
            entry.organizationId?.toHexString() ?? "",
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
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
