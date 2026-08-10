import { NextRequest, NextResponse } from "next/server";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { rotateWebhookEndpointSecret } from "@/lib/domain/webhooks";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireCapability("integration.manage");
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(400, "INVALID_ID", "Invalid webhook endpoint");
    const endpoint = await database.selectFrom("webhookEndpoints").select(["id", "pageId"])
      .where("id", "=", id).executeTakeFirst();
    if (!endpoint) return apiError(404, "WEBHOOK_NOT_FOUND", "Webhook endpoint not found");
    await assertPageInOrg(endpoint.pageId, session.orgId);
    const secret = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const rotated = await rotateWebhookEndpointSecret(id, transaction);
      if (!rotated) return null;
      await transaction.insertInto("auditLogs").values({
        orgId: session.orgId,
        actor: session.email,
        action: "ROTATE_WEBHOOK_SECRET",
        target: id,
        supportSessionId: session.supportSessionId ?? null,
        createdAt: new Date(),
      }).execute();
      return rotated;
    });
    if (!secret) return apiError(404, "WEBHOOK_NOT_FOUND", "Webhook endpoint not found");
    return NextResponse.json({ token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour });
  } catch (error) {
    return routeError(error, { route: "POST /api/admin/webhook-endpoints/:id/rotate" });
  }
}
