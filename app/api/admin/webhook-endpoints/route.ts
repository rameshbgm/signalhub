import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { insertVerifiedWebhookEndpoint, prepareVerifiedWebhookEndpoint } from "@/lib/domain/webhooks";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";

const schema = z.object({
  pageId: z.string().refine(isDatabaseId, "Malformed page identifier"),
  url: z.string().url().max(2_048),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    await assertPageInOrg(parsed.data.pageId, session.orgId);
    const prepared = await prepareVerifiedWebhookEndpoint(parsed.data.pageId, parsed.data.url);
    const result = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const page = await transaction.selectFrom("pages").select("id")
        .where("id", "=", parsed.data.pageId).where("orgId", "=", session.orgId)
        .where("deletedAt", "is", null).forShare().executeTakeFirst();
      if (!page) throw new Error("Page not found in your organization");
      const created = await insertVerifiedWebhookEndpoint(prepared, transaction);
      await transaction.insertInto("auditLogs").values({
        orgId: session.orgId,
        actor: session.email,
        action: "CREATE_WEBHOOK_ENDPOINT",
        target: created.endpoint.id,
        supportSessionId: session.supportSessionId ?? null,
        createdAt: new Date(),
      }).execute();
      return created;
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Webhook verification")) {
      return apiError(400, "WEBHOOK_VERIFICATION_FAILED", error.message);
    }
    return routeError(error, { route: "POST /api/admin/webhook-endpoints" });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!isDatabaseId(id)) return apiError(400, "INVALID_ID", "A valid webhook endpoint id is required");
    const endpoint = await database.selectFrom("webhookEndpoints").select(["id", "pageId"])
      .where("id", "=", id).executeTakeFirst();
    if (!endpoint) return apiError(404, "WEBHOOK_NOT_FOUND", "Webhook endpoint not found");
    await assertPageInOrg(endpoint.pageId, session.orgId);
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      await transaction.deleteFrom("webhookEndpoints").where("id", "=", endpoint.id)
        .where("pageId", "=", endpoint.pageId).execute();
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error, { route: "DELETE /api/admin/webhook-endpoints" });
  }
}
