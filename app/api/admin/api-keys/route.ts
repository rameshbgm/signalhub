import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { ApiKeyScope } from "@/lib/postgres/schema";
import { generateApiKey } from "@/lib/tokens";

const API_KEY_SCOPES = ["status.read", "components.read", "components.write", "incidents.read", "incidents.write", "metrics.read", "metrics.write", "analytics.read"] as const satisfies readonly ApiKeyScope[];
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  pageIds: z.array(z.string().refine(isDatabaseId)).max(100).nullable().default(null),
  expiresAt: z.string().datetime().nullable().default(null),
  allowedCidrs: z.array(z.string().trim().min(1).max(64)).max(20).nullable().default(null),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const pageIds = parsed.data.pageIds ? [...new Set(parsed.data.pageIds)] : null;
    if (pageIds?.length) {
      const pages = await database.selectFrom("pages").select("id").where("id", "in", pageIds)
        .where("orgId", "=", session.orgId).where("deletedAt", "is", null).execute();
      if (pages.length !== pageIds.length) return apiError(400, "INVALID_PAGE_SCOPE", "One or more pages are outside this organization");
    }
    const secret = generateApiKey();
    const key = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const created = await transaction.insertInto("apiKeys").values({
        orgId: session.orgId,
        name: parsed.data.name,
        keyHash: secret.hash,
        prefix: secret.prefix,
        lastFour: secret.lastFour,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
        createdBy: session.userId,
        scopes: parsed.data.scopes,
        pageIds,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        allowedCidrs: parsed.data.allowedCidrs,
        legacyFullAccess: false,
      }).returning("id").executeTakeFirstOrThrow();
      return created;
    });
    return NextResponse.json({ id: key.id, token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour }, { status: 201 });
  } catch (error) {
    return routeError(error, { route: "POST /api/admin/api-keys" });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!isDatabaseId(id)) return apiError(400, "INVALID_ID", "A valid API key id is required");
    const result = await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      return transaction.updateTable("apiKeys").set({ revokedAt: new Date() })
        .where("id", "=", id).where("orgId", "=", session.orgId).where("revokedAt", "is", null)
        .returning("id").executeTakeFirst();
    });
    if (!result) return apiError(404, "API_KEY_NOT_FOUND", "API key not found");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error, { route: "DELETE /api/admin/api-keys" });
  }
}
