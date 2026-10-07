import { NextResponse } from "next/server";
import { assertPageInOrg, requireOrgSession } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { listMonitorChecks } from "@/lib/monitor-checks";
import { database } from "@/lib/postgres/client";

/** One keyset page of a monitor's check history: ?beforeAt=<ISO>&beforeId=<uuid>&result=up|down&order=asc|desc. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "NOT_FOUND", "Monitor not found");
    const session = await requireOrgSession();
    const monitor = await database.selectFrom("monitors").select(["id", "pageId"])
      .where("id", "=", id).executeTakeFirst();
    // Same visibility as the monitors page: the page must be in the org and in the member's page scope.
    const inScope = monitor && (session.role === "ADMIN" || session.pageIds === null || session.pageIds.includes(monitor.pageId));
    if (!monitor || !inScope) return apiError(404, "NOT_FOUND", "Monitor not found");
    await assertPageInOrg(monitor.pageId, session.orgId);

    const url = new URL(request.url);
    const beforeAt = url.searchParams.get("beforeAt");
    const beforeId = url.searchParams.get("beforeId");
    let before = null;
    if (beforeAt || beforeId) {
      if (!beforeAt || !beforeId || !isDatabaseId(beforeId) || Number.isNaN(Date.parse(beforeAt))) {
        return apiError(400, "INVALID_CURSOR", "Invalid history cursor");
      }
      before = { checkedAt: beforeAt, id: beforeId };
    }
    const result = url.searchParams.get("result");
    const order = url.searchParams.get("order");
    return NextResponse.json(await listMonitorChecks(monitor.id, before, undefined, {
      result: result === "up" || result === "down" ? result : undefined,
      order: order === "asc" ? "asc" : "desc",
    }));
  } catch (error) {
    return routeError(error, { route: "GET /api/admin/monitors/:id/checks" });
  }
}
