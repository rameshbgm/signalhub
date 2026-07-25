import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { writePlatformAudit } from "@/lib/platform-policy";
import { generateSecret } from "@/lib/secrets";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePlatformCapability("identity.manage");
    const { id } = await params;
    const connection = await collections.identityConnections().findOne({
      _id: oid(id),
      audience: "ORGANIZATION",
    });
    if (!connection) return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    const body = await request.json().catch(() => ({})) as { expiresAt?: string | null };
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
      return apiError(400, "INVALID_EXPIRATION", "Expiration must be in the future");
    }
    const now = new Date();
    const secret = generateSecret("scim_");
    await collections.scimTokens().updateMany(
      { connectionId: connection._id, revokedAt: null },
      { $set: { revokedAt: now } }
    );
    await collections.scimTokens().insertOne({
      _id: new ObjectId(),
      connectionId: connection._id,
      tokenHash: secret.hash,
      prefix: secret.prefix,
      lastFour: secret.lastFour,
      createdBy: oid(actor.platformAdminId),
      createdAt: now,
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
    });
    await writePlatformAudit({
      actorId: oid(actor.platformAdminId),
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "SCIM_TOKEN_ROTATED",
      targetType: "identityConnection",
      targetId: connection._id.toHexString(),
      organizationId: connection.orgId,
      metadata: { expiresAt },
    });
    return NextResponse.json({ token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePlatformCapability("identity.manage");
    const { id } = await params;
    const connection = await collections.identityConnections().findOne({ _id: oid(id) });
    if (!connection) return apiError(404, "IDENTITY_CONNECTION_NOT_FOUND", "Identity connection not found");
    await collections.scimTokens().updateMany(
      { connectionId: connection._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    await writePlatformAudit({
      actorId: oid(actor.platformAdminId),
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "SCIM_TOKEN_REVOKED",
      targetType: "identityConnection",
      targetId: connection._id.toHexString(),
      organizationId: connection.orgId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
