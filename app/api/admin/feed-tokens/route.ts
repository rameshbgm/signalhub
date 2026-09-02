import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { generateFeedToken } from "@/lib/tokens";

const createSchema = z.object({
  pageId: z.string().refine(isDatabaseId, "Malformed page identifier"),
  name: z.string().trim().min(1).max(100),
  componentIds: z.array(z.string().refine(isDatabaseId, "Malformed component identifier")).max(500).nullable().default(null),
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
    if (page.type === "PUBLIC") return apiError(400, "TOKEN_NOT_REQUIRED", "Public pages do not require a feed token");
    const componentIds = parsed.data.componentIds;
    if (componentIds?.length) {
      const components = await database.selectFrom("components").select("id")
        .where("id", "in", componentIds).where("pageId", "=", page.id).execute();
      if (components.length !== componentIds.length) return apiError(400, "INVALID_COMPONENT_SCOPE", "One or more components do not belong to this page");
    }
    const secret = generateFeedToken();
    const created = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const currentPage = await transaction.selectFrom("pages").select("id")
        .where("id", "=", page.id).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
        .forShare().executeTakeFirst();
      if (!currentPage) throw new Error("Page not found in your organization");
      if (componentIds?.length) {
        const components = await transaction.selectFrom("components").select("id")
          .where("id", "in", componentIds).where("pageId", "=", currentPage.id).execute();
        if (components.length !== componentIds.length) throw new Error("One or more components do not belong to this page");
      }
      const token = await transaction.insertInto("feedTokens").values({
        pageId: currentPage.id,
        name: parsed.data.name,
        tokenHash: secret.hash,
        prefix: secret.prefix,
        lastFour: secret.lastFour,
        componentIds,
        createdBy: session.userId,
        createdAt: new Date(),
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        revokedAt: null,
        lastUsedAt: null,
      }).returning("id").executeTakeFirstOrThrow();
      return token;
    });
    return NextResponse.json({ id: created.id, token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour }, { status: 201 });
  } catch (error) {
    return routeError(error, { route: "POST /api/admin/feed-tokens" });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!isDatabaseId(id)) return apiError(400, "INVALID_ID", "A valid feed token id is required");
    const token = await database.selectFrom("feedTokens as token")
      .innerJoin("pages as page", "page.id", "token.pageId")
      .select(["token.id", "token.pageId"]).where("token.id", "=", id)
      .where("page.orgId", "=", session.orgId).executeTakeFirst();
    if (!token) return apiError(404, "FEED_TOKEN_NOT_FOUND", "Feed token not found");
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const revoked = await transaction.updateTable("feedTokens").set({ revokedAt: new Date() })
        .where("id", "=", token.id).where("pageId", "=", token.pageId).returning("id").executeTakeFirst();
      if (!revoked) throw new Error("Feed token not found");
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error, { route: "DELETE /api/admin/feed-tokens" });
  }
}
