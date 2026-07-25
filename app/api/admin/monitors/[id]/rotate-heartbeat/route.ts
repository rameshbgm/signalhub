import { NextResponse } from "next/server";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { generateAutomationToken } from "@/lib/tokens";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const monitor = await collections.monitors().findOne({ _id: oid(id), type: "HEARTBEAT" });
    if (!monitor) return apiError(404, "NOT_FOUND", "Heartbeat monitor not found");
    const session = await requireCapability("monitor.manage", monitor.pageId.toHexString());
    await assertPageInOrg(monitor.pageId.toHexString(), session.orgId);
    const generated = generateAutomationToken();
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const page = await collections.pages().findOne(
        { _id: monitor.pageId, orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!page) throw new Error("Heartbeat monitor not found");
      await collections.monitors().updateOne(
        { _id: monitor._id, pageId: page._id, type: "HEARTBEAT" },
        { $set: { heartbeatTokenHash: generated.hash } },
        { session: databaseSession }
      );
    });
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    return NextResponse.json({
      ok: true,
      token: generated.token,
      url: `${base}/api/v1/heartbeat/${generated.token}`,
    });
  } catch (error) {
    return routeError(error);
  }
}
