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
    // Kept as a transaction helper during the tenant-audit retirement so
    // callers retain their organization lifecycle fence.
    void audit;
    return verify ? verify(transaction) : undefined as T;
  });
}
