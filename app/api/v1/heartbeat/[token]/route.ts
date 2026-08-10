import { NextResponse } from "next/server";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { hashSecret } from "@/lib/secrets";

async function heartbeat(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = hashSecret(token);
  const monitor = await database.selectFrom("monitors as monitor")
    .innerJoin("pages as page", "page.id", "monitor.pageId")
    .innerJoin("organizations as organization", "organization.id", "page.orgId")
    .select(["monitor.id", "monitor.pageId", "organization.id as orgId"])
    .where("monitor.type", "=", "HEARTBEAT").where("monitor.heartbeatTokenHash", "=", tokenHash)
    .where("monitor.enabled", "=", true).where("page.deletedAt", "is", null)
    .where("organization.status", "=", "ACTIVE").where("organization.suspended", "=", false)
    .executeTakeFirst();
  if (!monitor) return new NextResponse(null, { status: 404 });
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(monitor.orgId, transaction);
    const now = new Date();
    const changed = await transaction.updateTable("monitors").set({ lastHeartbeatAt: now, runRequestedAt: now })
      .where("id", "=", monitor.id).where("pageId", "=", monitor.pageId)
      .where("type", "=", "HEARTBEAT").where("heartbeatTokenHash", "=", tokenHash)
      .where("enabled", "=", true).returning("id").executeTakeFirst();
    if (!changed) throw new Error("Heartbeat monitor is unavailable");
  });
  return NextResponse.json({ ok: true, monitorId: monitor.id });
}

export const GET = heartbeat;
export const POST = heartbeat;
