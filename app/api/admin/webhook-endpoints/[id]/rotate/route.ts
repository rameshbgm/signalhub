import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { rotateWebhookEndpointSecret } from "@/lib/domain/webhooks";
import { oid } from "@/lib/mongo-utils";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCapability("integration.manage");
    const { id } = await params;
    const endpoint = await collections.webhookEndpoints().findOne({ _id: oid(id) });
    if (!endpoint) return apiError(404, "WEBHOOK_NOT_FOUND", "Webhook endpoint not found");
    await assertPageInOrg(endpoint.pageId.toHexString(), session.orgId);
    const secret = await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const page = await collections.pages().findOne(
        { _id: endpoint.pageId, orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!page) throw new Error("Webhook endpoint not found");
      const rotated = await rotateWebhookEndpointSecret(id, databaseSession);
      if (!rotated) return null;
      await collections.auditLogs().insertOne({
        _id: new ObjectId(),
        orgId: oid(session.orgId),
        actor: session.email,
        action: "ROTATE_WEBHOOK_SECRET",
        target: id,
        supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
        createdAt: new Date(),
      }, { session: databaseSession });
      return rotated;
    });
    if (!secret) return apiError(404, "WEBHOOK_NOT_FOUND", "Webhook endpoint not found");
    return NextResponse.json({ token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour });
  } catch (error) {
    return routeError(error);
  }
}
