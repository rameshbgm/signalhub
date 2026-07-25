import { ObjectId, type ClientSession } from "mongodb";
import {
  collections,
  type PlatformAuditLogDoc,
  type PlatformRole,
} from "@/lib/db";
export {
  hasPlatformCapability,
  normalizedPlatformRole,
  platformAdminIsActive,
  type PlatformCapability,
} from "@/lib/platform-roles";

export async function writePlatformAudit(input: {
  actorId?: ObjectId | null;
  actorEmail: string;
  actorRole: PlatformRole | "SYSTEM";
  action: string;
  targetType: string;
  targetId: string;
  organizationId?: ObjectId | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}, options: { session?: ClientSession } = {}) {
  const entry: PlatformAuditLogDoc = {
    _id: new ObjectId(),
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    organizationId: input.organizationId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
    createdAt: new Date(),
  };
  await collections.platformAuditLogs().insertOne(
    entry,
    options.session ? { session: options.session } : undefined
  );
  return entry;
}
