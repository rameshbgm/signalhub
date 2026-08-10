import { NextResponse } from "next/server";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { generateAutomationToken } from "@/lib/tokens";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "NOT_FOUND", "Heartbeat monitor not found");
    const monitor = await database.selectFrom("monitors").select(["id", "pageId"])
      .where("id", "=", id).where("type", "=", "HEARTBEAT").executeTakeFirst();
    if (!monitor) return apiError(404, "NOT_FOUND", "Heartbeat monitor not found");
    const session = await requireCapability("monitor.manage", monitor.pageId);
    await assertPageInOrg(monitor.pageId, session.orgId);
    const generated = generateAutomationToken();
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const updated = await transaction.updateTable("monitors").set({ heartbeatTokenHash: generated.hash })
        .where("id", "=", monitor.id).where("pageId", "=", monitor.pageId).where("type", "=", "HEARTBEAT")
        .returning("id").executeTakeFirst();
      if (!updated) throw new Error("Heartbeat monitor not found");
    });
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    return NextResponse.json({ ok: true, token: generated.token, url: `${base}/api/v1/heartbeat/${generated.token}` });
  } catch (error) {
    return routeError(error, { route: "POST /api/admin/monitors/:id/rotate-heartbeat" });
  }
}
