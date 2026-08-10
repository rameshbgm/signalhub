import { withDatabaseTransaction, type DatabaseTransaction } from "@/lib/postgres/client";
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
    const verified = verify ? await verify(transaction) : undefined;
    await transaction.insertInto("auditLogs").values({
      orgId: organizationId,
      actor: audit.actor,
      action: audit.action,
      target: audit.target,
      metadata: audit.metadata ?? null,
      supportSessionId: audit.supportSessionId ?? null,
      requestId: audit.requestId ?? null,
      sourceIp: audit.sourceIp ?? null,
      userAgent: audit.userAgent ?? null,
      outcome: audit.outcome ?? null,
      previousHash: audit.previousHash ?? null,
      entryHash: audit.entryHash ?? null,
      chainSequence: audit.chainSequence ?? null,
      createdAt: audit.createdAt ?? new Date(),
    }).execute();
    return verified as T;
  });
}
