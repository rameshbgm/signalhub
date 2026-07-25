import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { requirePlatformSession } from "@/lib/admin-guard";
import { collections, mongoClient } from "@/lib/db";
import { routeError } from "@/lib/api-response";
import { oid } from "@/lib/mongo-utils";
import { OrganizationMutationBlockedError } from "@/lib/organization-mutation";
import { hashSecret } from "@/lib/secrets";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

export async function POST() {
  try {
    const [platformSession, orgSession] = await Promise.all([
      requirePlatformSession(),
      getSession(),
    ]);
    if (
      !orgSession?.supportSessionId ||
      !orgSession.supportSessionToken
    ) {
      throw new Error("No active support session was found");
    }
    const supportId = oid(orgSession.supportSessionId);
    const now = new Date();
    const databaseSession = mongoClient.startSession();
    try {
      const endedSupport = await databaseSession.withTransaction(async () => {
        const support = await collections.supportSessions().findOne(
          {
            _id: supportId,
            platformAdminId: oid(platformSession.platformAdminId),
            tokenHash: hashSecret(orgSession.supportSessionToken!),
            revokedAt: null,
          },
          { session: databaseSession }
        );
        if (!support) return null;
        const ended = await collections.supportSessions().updateOne(
          { _id: support._id, revokedAt: null },
          {
            $set: {
              revokedAt: now,
              endedAt: now,
              revokedBy: oid(platformSession.platformAdminId),
              revokedReason: "support operator ended session",
            },
          },
          { session: databaseSession }
        );
        if (!ended.modifiedCount) return null;
        await collections.platformAuditLogs().insertOne(
          {
            _id: new ObjectId(),
            actorId: oid(platformSession.platformAdminId),
            actorEmail: platformSession.email,
            actorRole: platformSession.role,
            action: "SUPPORT_SESSION_ENDED",
            targetType: "supportSession",
            targetId: support._id.toHexString(),
            organizationId: support.orgId,
            reason: "support operator ended session",
            metadata: { mode: support.mode ?? "VIEW" },
            createdAt: now,
          },
          { session: databaseSession }
        );
        return {
          id: support._id,
          orgId: support.orgId,
          mode: support.mode ?? "VIEW",
        };
      });
      if (endedSupport) {
        try {
          await writeActiveTenantAudit(endedSupport.orgId, {
            actor: platformSession.email,
            action: "SUPPORT_SESSION_ENDED",
            target: endedSupport.id.toHexString(),
            metadata: { mode: endedSupport.mode },
            supportSessionId: endedSupport.id,
            createdAt: now,
          });
        } catch (error) {
          // The platform support lifecycle remains auditable after a tenant is
          // suspended or purged; omit only the now-invalid tenant audit copy.
          if (!(error instanceof OrganizationMutationBlockedError)) throw error;
        }
      }
    } finally {
      await databaseSession.endSession();
    }
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
