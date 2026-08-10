import { NextRequest, NextResponse } from "next/server";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { isDatabaseId } from "@/lib/database-id";
import { writePlatformAudit } from "@/lib/platform-policy";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { generateSecret } from "@/lib/secrets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformCapability("identity.manage");
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    const connection = await database.selectFrom("identityConnections").select(["id", "orgId"])
      .where("id", "=", id).where("audience", "=", "ORGANIZATION").executeTakeFirst();
    if (!connection) return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    const body = await request.json().catch(() => ({})) as { expiresAt?: string | null };
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
      return apiError(400, "INVALID_EXPIRATION", "Expiration must be in the future");
    }
    const now = new Date();
    const secret = generateSecret("scim_");
    await withDatabaseTransaction(async (transaction) => {
      await transaction.updateTable("scimTokens").set({ revokedAt: now })
        .where("connectionId", "=", connection.id).where("revokedAt", "is", null).execute();
      await transaction.insertInto("scimTokens").values({
        connectionId: connection.id, tokenHash: secret.hash, prefix: secret.prefix,
        lastFour: secret.lastFour, createdBy: actor.platformAdminId, createdAt: now,
        lastUsedAt: null, expiresAt, revokedAt: null,
      }).execute();
      await writePlatformAudit({
        actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
        action: "SCIM_TOKEN_ROTATED", targetType: "identityConnection", targetId: connection.id,
        organizationId: connection.orgId, metadata: { expiresAt },
      }, { executor: transaction });
    });
    return NextResponse.json({ token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour });
  } catch (error) {
    return routeError(error, { route: "POST /api/platform/identity-connections/:id/scim-token" });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformCapability("identity.manage");
    const { id } = await params;
    if (!isDatabaseId(id)) return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    const connection = await database.selectFrom("identityConnections").select(["id", "orgId"]).where("id", "=", id).executeTakeFirst();
    if (!connection) return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    await withDatabaseTransaction(async (transaction) => {
      await transaction.updateTable("scimTokens").set({ revokedAt: new Date() })
        .where("connectionId", "=", connection.id).where("revokedAt", "is", null).execute();
      await writePlatformAudit({
        actorId: actor.platformAdminId, actorEmail: actor.email, actorRole: actor.role,
        action: "SCIM_TOKEN_REVOKED", targetType: "identityConnection", targetId: connection.id,
        organizationId: connection.orgId,
      }, { executor: transaction });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error, { route: "DELETE /api/platform/identity-connections/:id/scim-token" });
  }
}
