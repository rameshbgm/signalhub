import { NextResponse } from "next/server";
import { assertPageInOrg, requireOrgSession } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { listMonitorChecks } from "@/lib/monitor-checks";
import { database } from "@/lib/postgres/client";

/** One numbered page of a monitor's check history: ?page=N&result=up|down&sort=newest|oldest|slowest|fastest. */
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
    const result = url.searchParams.get("result");
    const sort = url.searchParams.get("sort");
    return NextResponse.json(await listMonitorChecks(monitor.id, Number(url.searchParams.get("page")), undefined, {
      result: result === "up" || result === "down" ? result : undefined,
      sort: sort === "oldest" || sort === "slowest" || sort === "fastest" ? sort : "newest",
    }));
  } catch (error) {
    return routeError(error, { route: "GET /api/admin/monitors/:id/checks" });
  }
}
