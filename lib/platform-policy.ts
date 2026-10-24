import { newDatabaseId } from "@/lib/database-id";
import { database, type DatabaseExecutor } from "@/lib/postgres/client";
export {
  hasPlatformCapability,
  normalizedPlatformRole,
  platformAdminIsActive,
  type PlatformCapability,
  type PlatformRole,
} from "@/lib/platform-roles";
import type { PlatformRole } from "@/lib/platform-roles";

export async function writePlatformAudit(input: {
  actorId?: string | null;
  actorEmail: string;
  actorRole: PlatformRole | "SYSTEM";
  action: string;
  targetType: string;
  targetId: string;
  organizationId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}, options: { executor?: DatabaseExecutor } = {}) {
  const executor = options.executor ?? database;
  const entry = {
    id: newDatabaseId(),
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    organizationId: input.organizationId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
    previousHash: null,
    entryHash: null,
    chainSequence: null,
    createdAt: new Date(),
  };
  await executor.insertInto("platformAuditLogs").values(entry).execute();
  return entry;
}
