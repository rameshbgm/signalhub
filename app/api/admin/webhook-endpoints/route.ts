import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import {
  insertVerifiedWebhookEndpoint,
  prepareVerifiedWebhookEndpoint,
} from "@/lib/domain/webhooks";
import { oid } from "@/lib/mongo-utils";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

const schema = z.object({
  pageId: z.string().refine(ObjectId.isValid, "Malformed page identifier"),
  url: z.string().url().max(2_048),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    await assertPageInOrg(parsed.data.pageId, session.orgId);
    const prepared = await prepareVerifiedWebhookEndpoint(
      parsed.data.pageId,
      parsed.data.url
    );
    const result = await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const currentPage = await collections.pages().findOne(
        { _id: oid(parsed.data.pageId), orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!currentPage) throw new Error("Page not found in your organization");
      const created = await insertVerifiedWebhookEndpoint(
        prepared,
        databaseSession
      );
      await collections.auditLogs().insertOne({
        _id: new ObjectId(),
        orgId: oid(session.orgId),
        actor: session.email,
        action: "CREATE_WEBHOOK_ENDPOINT",
        target: created.endpoint.id,
        supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
        createdAt: new Date(),
      }, { session: databaseSession });
      return created;
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Webhook verification")) {
      return apiError(400, "WEBHOOK_VERIFICATION_FAILED", error.message);
    }
    return routeError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return apiError(400, "MISSING_ID", "Webhook endpoint id is required");
    const endpoint = await collections.webhookEndpoints().findOne({ _id: oid(id) });
    if (!endpoint) return apiError(404, "WEBHOOK_NOT_FOUND", "Webhook endpoint not found");
    await assertPageInOrg(endpoint.pageId.toHexString(), session.orgId);
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const page = await collections.pages().findOne(
        { _id: endpoint.pageId, orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!page) throw new Error("Webhook endpoint not found");
      await collections.webhookEndpoints().deleteOne(
        { _id: endpoint._id, pageId: page._id },
        { session: databaseSession }
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
