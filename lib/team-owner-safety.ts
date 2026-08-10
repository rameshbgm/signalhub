import { sql } from "kysely";
import type { DatabaseTransaction } from "@/lib/postgres/client";

type MembershipAdminState = {
  role: string;
  status?: string;
};

export function isActiveAdmin(state: MembershipAdminState) {
  return (
    state.role === "ADMIN" &&
    state.status !== "REVOKED" &&
    state.status !== "INVITED"
  );
}

export function transitionRemovesActiveAdmin(
  current: MembershipAdminState,
  next: Partial<MembershipAdminState>
) {
  return isActiveAdmin(current) && !isActiveAdmin({ ...current, ...next });
}

/**
 * Serializes membership transitions that can affect the installation-wide
 * Admin invariant. The global fence is the transaction's first write so two
 * organizations cannot concurrently remove the final active Admin.
 */
export async function withOrganizationAdminInvariantTransaction<T>(
  _organizationId: string,
  work: (transaction: DatabaseTransaction) => Promise<T>
): Promise<T> {
  const { withDatabaseTransaction } = await import("@/lib/postgres/client");
  return withDatabaseTransaction(async (transaction) => {
    await sql`select pg_advisory_xact_lock(hashtext('signalhub:active-admin'))`.execute(transaction);
    return work(transaction);
  });
}
