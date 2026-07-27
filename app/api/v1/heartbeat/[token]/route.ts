import { NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { hashSecret } from "@/lib/secrets";
import { organizationIsActive } from "@/lib/organization-state";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { activePageFilter } from "@/lib/page-lifecycle";

async function heartbeat(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const monitor = await collections.monitors().findOne({
    type: "HEARTBEAT",
    heartbeatTokenHash: hashSecret(token),
    enabled: true,
  });
  if (!monitor) return new NextResponse(null, { status: 404 });
  const page = await collections.pages().findOne(activePageFilter({ _id: monitor.pageId }));
  const organization = page
    ? await collections.organizations().findOne({ _id: page.orgId })
    : null;
  if (!page || !organization || !organizationIsActive(organization)) {
    return new NextResponse(null, { status: 403 });
  }
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(organization._id, databaseSession);
    const currentPage = await collections.pages().findOne(
      activePageFilter({ _id: page._id, orgId: organization._id }),
      { session: databaseSession }
    );
    if (!currentPage) throw new Error("Heartbeat monitor is unavailable");
    const changed = await collections.monitors().updateOne(
      {
        _id: monitor._id,
        pageId: currentPage._id,
        type: "HEARTBEAT",
        heartbeatTokenHash: hashSecret(token),
        enabled: true,
      },
      { $set: { lastHeartbeatAt: new Date(), runRequestedAt: new Date() } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) {
      throw new Error("Heartbeat monitor is unavailable");
    }
  });
  return NextResponse.json({ ok: true, monitorId: monitor._id.toHexString() });
}

export const GET = heartbeat;
export const POST = heartbeat;
