import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { apiError, routeError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { generateApiKey } from "@/lib/tokens";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCapability("integration.manage");
    const { id } = await params;
    const secret = generateApiKey();
    const result = await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const changed = await collections.apiKeys().updateOne(
        { _id: oid(id), orgId: oid(session.orgId), revokedAt: null },
        {
          $set: {
            keyHash: secret.hash,
            prefix: secret.prefix,
            lastFour: secret.lastFour,
            lastUsedAt: null,
            legacyFullAccess: false,
          },
        },
        { session: databaseSession }
      );
      if (!changed.matchedCount) return changed;
      await collections.auditLogs().insertOne({
        _id: new ObjectId(),
        orgId: oid(session.orgId),
        actor: session.email,
        action: "ROTATE_API_KEY",
        target: id,
        supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
        createdAt: new Date(),
      }, { session: databaseSession });
      return changed;
    });
    if (!result.matchedCount) return apiError(404, "API_KEY_NOT_FOUND", "API key not found");
    return NextResponse.json({ token: secret.token, prefix: secret.prefix, lastFour: secret.lastFour });
  } catch (error) {
    return routeError(error);
  }
}
