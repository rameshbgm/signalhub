import { database } from "@/lib/postgres/client";
import { writePlatformAudit } from "@/lib/platform-policy";

type SupportAwareSession = {
  orgId: string;
  email: string;
  supportSessionId?: string;
};

export async function writeSupportMutationAudit(
  session: SupportAwareSession,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown> | null;
    tenantAuditExists?: boolean;
  }
) {
  if (!session.supportSessionId) return;
  const support = await database.selectFrom("supportSessions")
    .selectAll()
    .where("id", "=", session.supportSessionId)
    .where("orgId", "=", session.orgId)
    .executeTakeFirst();
  if (!support) throw new Error("Support audit context is no longer available");
  const platformAdmin = await database.selectFrom("users")
    .select(["id", "email"])
    .where("id", "=", support.platformAdminId)
    .executeTakeFirst();
  if (!platformAdmin) throw new Error("Support actor is no longer available");
  await writePlatformAudit({
    actorId: platformAdmin.id,
    actorEmail: platformAdmin.email,
    actorRole: "ADMIN",
    action: "SUPPORT_ACTION_PERFORMED",
    targetType: input.targetType,
    targetId: input.targetId,
    organizationId: support.orgId,
    reason: support.reason,
    metadata: {
      tenantAction: input.action,
      supportSessionId: support.id,
      supportMode: support.mode,
      supportScopes: support.scopes,
      ...(input.metadata ?? {}),
    },
  });
}
