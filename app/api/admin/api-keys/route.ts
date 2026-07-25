import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { generateApiKey } from "@/lib/tokens";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import type { ApiKeyScope } from "@/lib/db";

const API_KEY_SCOPES = [
  "status.read",
  "components.read",
  "components.write",
  "incidents.read",
  "incidents.write",
  "metrics.read",
  "metrics.write",
  "analytics.read",
] as const satisfies readonly ApiKeyScope[];

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  pageIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(100).nullable().default(null),
  expiresAt: z.string().datetime().nullable().default(null),
  allowedCidrs: z.array(z.string().trim().min(1).max(64)).max(20).nullable().default(null),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability("integration.manage");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const secret = generateApiKey();
    const id = new ObjectId();
    if (parsed.data.pageIds?.length) {
      const pageCount = await collections.pages().countDocuments({
        _id: { $in: parsed.data.pageIds.map(oid) },
        orgId: oid(session.orgId),
      });
      if (pageCount !== new Set(parsed.data.pageIds).size) {
        return apiError(400, "INVALID_PAGE_SCOPE", "One or more pages are outside this organization");
      }
    }
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      await collections.apiKeys().insertOne({
        _id: id,
        orgId: oid(session.orgId),
        name: parsed.data.name,
        keyHash: secret.hash,
        prefix: secret.prefix,
        lastFour: secret.lastFour,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
        createdBy: oid(session.userId),
        scopes: parsed.data.scopes,
        pageIds: parsed.data.pageIds?.map(oid) ?? null,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        allowedCidrs: parsed.data.allowedCidrs,
        legacyFullAccess: false,
      }, { session: databaseSession });
      await collections.auditLogs().insertOne({
        _id: new ObjectId(),
        orgId: oid(session.orgId),
        actor: session.email,
        action: "CREATE_API_KEY",
        target: parsed.data.name,
        supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
        metadata: {
          scopes: parsed.data.scopes,
          pageIds: parsed.data.pageIds,
          expiresAt: parsed.data.expiresAt,
          allowedCidrs: parsed.data.allowedCidrs,
        },
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
    if (!id) return apiError(400, "MISSING_ID", "API key id is required");
    const result = await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      return collections.apiKeys().updateOne(
        { _id: oid(id), orgId: oid(session.orgId), revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session: databaseSession }
      );
    });
    if (!result.matchedCount) return apiError(404, "API_KEY_NOT_FOUND", "API key not found");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
