import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { routeError } from "@/lib/api-response";

function csv(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireCapability("audit.view");
    const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
    const entries = await collections.auditLogs().find({ orgId: oid(session.orgId) })
      .sort({ createdAt: 1 }).limit(100_000).toArray();
    const body = format === "json"
      ? JSON.stringify({
          manifest: { format: "status-audit-export", version: 1, generatedAt: new Date().toISOString() },
          entries,
        })
      : [
          "id,createdAt,actor,action,target,outcome,requestId,sourceIp,metadata",
          ...entries.map((entry) => [
            entry._id.toHexString(),
            entry.createdAt.toISOString(),
            entry.actor,
            entry.action,
            entry.target,
            entry.outcome ?? "SUCCESS",
            entry.requestId ?? "",
            entry.sourceIp ?? "",
            entry.metadata ?? {},
          ].map(csv).join(",")),
        ].join("\n");
    const checksum = createHash("sha256").update(body).digest("hex");
    return new NextResponse(body, {
      headers: {
        "content-type": format === "json" ? "application/json" : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="tenant-audit.${format}"`,
        "x-content-sha256": checksum,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
