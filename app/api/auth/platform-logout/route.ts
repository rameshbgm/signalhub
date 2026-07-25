import { NextResponse } from "next/server";
import {
  destroyPlatformSession,
  destroySession,
  getPlatformSession,
  getSession,
} from "@/lib/auth";
import { collections } from "@/lib/db";
import { writePlatformAudit } from "@/lib/platform-policy";
import { oid } from "@/lib/mongo-utils";
import { OrganizationMutationBlockedError } from "@/lib/organization-mutation";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

export async function POST() {
  const [platformSession, orgSession] = await Promise.all([
    getPlatformSession(),
    getSession(),
  ]);
  const now = new Date();
  let revokedSupportSessionCount = 0;
  let lifecycleError: unknown = null;

  try {
    const activeSupportSessions = platformSession
      ? await collections
          .supportSessions()
          .find({
            platformAdminId: oid(platformSession.platformAdminId),
            revokedAt: null,
          })
          .toArray()
      : orgSession?.supportSessionId
        ? await collections
            .supportSessions()
            .find({
              _id: oid(orgSession.supportSessionId),
              revokedAt: null,
            })
            .toArray()
        : [];

    if (activeSupportSessions.length) {
      const supportSessionIds = activeSupportSessions.map((support) => support._id);
      const revoked = await collections.supportSessions().updateMany(
        {
          _id: { $in: supportSessionIds },
          revokedAt: null,
          ...(platformSession
            ? { platformAdminId: oid(platformSession.platformAdminId) }
            : {}),
        },
        {
          $set: {
            revokedAt: now,
            endedAt: now,
            revokedBy: platformSession
              ? oid(platformSession.platformAdminId)
              : activeSupportSessions[0].platformAdminId,
            revokedReason: "platform administrator logout",
          },
        }
      );
      revokedSupportSessionCount = revoked.modifiedCount;

      for (const support of activeSupportSessions) {
        try {
          await writeActiveTenantAudit(support.orgId, {
            actor:
              platformSession?.email ??
              orgSession?.supportActorEmail ??
              orgSession?.email ??
              "platform administrator",
            action: "SUPPORT_SESSION_ENDED",
            target: support._id.toHexString(),
            supportSessionId: support._id,
            metadata: {
              reason: "platform administrator logout",
              mode: support.mode ?? "VIEW",
            },
            createdAt: now,
          });
        } catch (error) {
          // Purge removes tenant audit history. Do not recreate it, and do not
          // prevent the administrator from clearing their local sessions.
          if (!(error instanceof OrganizationMutationBlockedError)) throw error;
        }
      }
    }
  } catch (error) {
    lifecycleError = error;
  }

  if (platformSession) {
    await writePlatformAudit({
      actorId: oid(platformSession.platformAdminId),
      actorEmail: platformSession.email,
      actorRole: platformSession.role,
      action: "PLATFORM_LOGOUT",
      targetType: "platformAdmin",
      targetId: platformSession.platformAdminId,
      metadata: {
        revokedSupportSessionCount,
        clearedSupportOrgSession: Boolean(orgSession?.supportSessionId),
        lifecycleError: lifecycleError ? "support session cleanup failed" : null,
      },
    }).catch((error) => {
      lifecycleError ??= error;
    });
  }

  await destroyPlatformSession();
  if (orgSession?.supportSessionId) {
    await destroySession();
  }

  return NextResponse.json(
    lifecycleError
      ? {
          ok: false,
          error: {
            code: "LOGOUT_CLEANUP_FAILED",
            message: "Signed out locally, but server-side support cleanup was incomplete",
          },
        }
      : { ok: true },
    { status: lifecycleError ? 503 : 200 }
  );
}
