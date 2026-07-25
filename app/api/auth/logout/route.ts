import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { OrganizationMutationBlockedError } from "@/lib/organization-mutation";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

export async function POST() {
  const session = await getSession();
  try {
    if (session?.supportSessionId) {
      const now = new Date();
      await collections.supportSessions().updateOne(
        { _id: oid(session.supportSessionId), revokedAt: null },
        {
          $set: {
            revokedAt: now,
            endedAt: now,
            revokedReason: "support session logout",
          },
        }
      );
      try {
        await writeActiveTenantAudit(session.orgId, {
          actor: session.supportActorEmail ?? session.email,
          action: "SUPPORT_SESSION_ENDED",
          target: session.supportSessionId,
          supportSessionId: oid(session.supportSessionId),
          metadata: { reason: "logout" },
          createdAt: now,
        });
      } catch (error) {
        // Logging out must remain possible after suspension or purge wins the
        // lifecycle race. Only the tenant copy is omitted in that case.
        if (!(error instanceof OrganizationMutationBlockedError)) throw error;
      }
    }
  } finally {
    await destroySession();
  }
  return NextResponse.json({ ok: true });
}
