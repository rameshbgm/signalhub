import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { signedWebhookHeaders } from "@/lib/domain/webhooks";
import { guardedFetch } from "@/lib/guarded-fetch";
import { database } from "@/lib/postgres/client";

/** Sends one signed `status.test` event so the receiver can check its signature handling. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(400, "INVALID_ID", "Invalid webhook endpoint");
    const endpoint = await database.selectFrom("webhookEndpoints").select(["id", "pageId", "url", "secretCiphertext"])
      .where("id", "=", id).executeTakeFirst();
    if (!endpoint) return apiError(404, "WEBHOOK_NOT_FOUND", "Webhook endpoint not found");
    // Page-scoped check, so scoped roles can only test endpoints of their own pages.
    const session = await requireCapability("integration.manage", endpoint.pageId);
    const page = await assertPageInOrg(endpoint.pageId, session.orgId);
    const deliveryId = randomUUID();
    const body = JSON.stringify({
      id: deliveryId,
      type: "status.test",
      pageId: page.id,
      message: "Test event from SignalHub. Verify the x-status-signature header with your signing secret.",
      sentAt: new Date().toISOString(),
    });
    try {
      const response = await guardedFetch(endpoint.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...signedWebhookHeaders(endpoint.secretCiphertext, "status.test", deliveryId, body) },
        body,
        signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000)),
      });
      if (!response.ok) return apiError(502, "TEST_FAILED", `Endpoint returned HTTP ${response.status}`);
    } catch (error) {
      return apiError(502, "TEST_FAILED", error instanceof Error ? error.message.slice(0, 300) : "Endpoint could not be reached");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error, { route: "POST /api/admin/webhook-endpoints/:id/test" });
  }
}
