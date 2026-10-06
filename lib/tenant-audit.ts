import { newDatabaseId } from "@/lib/database-id";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/lib/postgres/client";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

type TenantAuditEntry = {
  actor: string;
  action: string;
  target: string;
  metadata?: unknown;
  supportSessionId?: string | null;
  requestId?: string | null;
  sourceIp?: string | null;
  userAgent?: string | null;
  outcome?: "SUCCESS" | "FAILURE" | null;
  previousHash?: string | null;
  entryHash?: string | null;
  chainSequence?: number | null;
  createdAt?: Date;
};

/**
 * Records an organization member's action on the sealed installation audit
 * log, scoped by organization_id. The seal job hash-chains it and delivers it
 * to installation-wide and organization audit sinks.
 */
export async function recordTenantAudit(
  executor: DatabaseExecutor,
  organizationId: string,
  entry: {
    actorEmail: string;
    actorId?: string | null;
    actorMembershipRole?: string | null;
    action: string;
    targetType?: string;
    targetId: string;
    metadata?: unknown;
    createdAt?: Date;
  }
) {
  const metadata = {
    ...(entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
      ? entry.metadata as Record<string, unknown>
      : entry.metadata === undefined || entry.metadata === null ? {} : { value: entry.metadata }),
    ...(entry.actorMembershipRole ? { membershipRole: entry.actorMembershipRole } : {}),
  };
  await executor.insertInto("platformAuditLogs").values({
    id: newDatabaseId(),
    actorId: entry.actorId ?? null,
    actorEmail: entry.actorEmail,
    actorRole: "TENANT",
    action: entry.action,
    targetType: entry.targetType ?? "tenant",
    targetId: entry.targetId,
    organizationId,
    reason: null,
    metadata: Object.keys(metadata).length ? metadata : null,
    previousHash: null,
    entryHash: null,
    chainSequence: null,
    createdAt: entry.createdAt ?? new Date(),
  }).execute();
}

export async function writeActiveTenantAudit(
  organizationId: string,
  audit: TenantAuditEntry
): Promise<void>;
export async function writeActiveTenantAudit<T>(
  organizationId: string,
  audit: TenantAuditEntry,
  verify: (transaction: DatabaseTransaction) => Promise<T>
): Promise<T>;
export async function writeActiveTenantAudit<T>(
  organizationId: string,
  audit: TenantAuditEntry,
  verify?: (transaction: DatabaseTransaction) => Promise<T>
) {
  return withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(organizationId, transaction);
    // Verify first so a refused action is never recorded as having happened.
    const result = verify ? await verify(transaction) : undefined as T;
    await recordTenantAudit(transaction, organizationId, {
      actorEmail: audit.actor,
      action: audit.action,
      targetId: audit.target,
      createdAt: audit.createdAt,
      metadata: {
        ...(audit.metadata && typeof audit.metadata === "object" ? audit.metadata as Record<string, unknown> : {}),
        ...(audit.supportSessionId ? { supportSessionId: audit.supportSessionId } : {}),
        ...(audit.requestId ? { requestId: audit.requestId } : {}),
        ...(audit.sourceIp ? { sourceIp: audit.sourceIp } : {}),
        ...(audit.outcome ? { outcome: audit.outcome } : {}),
      },
    });
    return result;
  });
}
