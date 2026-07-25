import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { generateFeedToken } from "@/lib/tokens";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

const createSchema = z.object({
  pageId: z.string().refine(ObjectId.isValid, "Malformed page identifier"),
  name: z.string().trim().min(1).max(100),
  componentIds: z.array(z.string().refine(ObjectId.isValid, "Malformed component identifier")).max(500).nullable().default(null),
  expiresAt: z.string().datetime().nullable().default(null),
}).superRefine((value, context) => {
  if (value.componentIds && new Set(value.componentIds).size !== value.componentIds.length) {
    context.addIssue({ code: "custom", path: ["componentIds"], message: "Components must be unique" });
  }
  if (value.expiresAt && new Date(value.expiresAt) <= new Date()) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be in the future" });
  }
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const page = await assertPageInOrg(parsed.data.pageId, session.orgId);
    if (page.type === "PUBLIC") {
      return apiError(400, "TOKEN_NOT_REQUIRED", "Public pages do not require a feed token");
    }
    const componentIds = parsed.data.componentIds?.map(oid) ?? null;
    if (componentIds) {
      const count = await collections.components().countDocuments({
        _id: { $in: componentIds },
        pageId: oid(parsed.data.pageId),
      });
      if (count !== componentIds.length) {
        return apiError(400, "INVALID_COMPONENT_SCOPE", "One or more components do not belong to this page");
      }
    }
    const secret = generateFeedToken();
    const id = new ObjectId();
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const currentPage = await collections.pages().findOne(
        { _id: oid(parsed.data.pageId), orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!currentPage) throw new Error("Page not found in your organization");
      if (componentIds?.length) {
        const count = await collections.components().countDocuments(
          { _id: { $in: componentIds }, pageId: currentPage._id },
          { session: databaseSession }
        );
        if (count !== componentIds.length) {
          throw new Error("One or more components do not belong to this page");
        }
      }
      await collections.feedTokens().insertOne({
        _id: id,
        pageId: currentPage._id,
        name: parsed.data.name,
        tokenHash: secret.hash,
        prefix: secret.prefix,
        lastFour: secret.lastFour,
        componentIds,
        createdBy: oid(session.userId),
        createdAt: new Date(),
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        revokedAt: null,
        lastUsedAt: null,
      }, { session: databaseSession });
      await collections.auditLogs().insertOne({
        _id: new ObjectId(),
        orgId: oid(session.orgId),
        actor: session.email,
        action: "CREATE_FEED_TOKEN",
        target: id.toHexString(),
        supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
        createdAt: new Date(),
      }, { session: databaseSession });
    });
    return NextResponse.json(
      { id: id.toHexString(), token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour },
      { status: 201 }
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return apiError(400, "MISSING_ID", "Feed token id is required");
    const token = await collections.feedTokens().findOne({ _id: oid(id) });
    if (!token) return apiError(404, "FEED_TOKEN_NOT_FOUND", "Feed token not found");
    const page = await collections.pages().findOne({ _id: token.pageId, orgId: oid(session.orgId) });
    if (!page) return apiError(404, "FEED_TOKEN_NOT_FOUND", "Feed token not found");
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const currentPage = await collections.pages().findOne(
        { _id: token.pageId, orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!currentPage) throw new Error("Feed token not found");
      await collections.feedTokens().updateOne(
        { _id: token._id, pageId: currentPage._id },
        { $set: { revokedAt: new Date() } },
        { session: databaseSession }
      );
      await collections.auditLogs().insertOne({
        _id: new ObjectId(),
        orgId: oid(session.orgId),
        actor: session.email,
        action: "REVOKE_FEED_TOKEN",
        target: token._id.toHexString(),
        supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
        createdAt: new Date(),
      }, { session: databaseSession });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
