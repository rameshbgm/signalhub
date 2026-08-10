import type { DatabaseTransaction } from "@/lib/postgres/client";

export class OrganizationMutationBlockedError extends Error {
  constructor() {
    super("The organization is not active");
    this.name = "OrganizationMutationBlockedError";
  }
}

/**
 * Establishes a durable ordering between an organization mutation and a
 * lifecycle transition.
 *
 * This must run inside the same PostgreSQL transaction as the tenant writes. The
 * organization-row update conflicts with suspension or deletion, while the
 * predicate prevents a transaction retried after that conflict from writing
 * into an inactive organization.
 */
export async function fenceActiveOrganizationMutation(
  organizationId: string,
  transaction: DatabaseTransaction
): Promise<void> {
  const result = await transaction
    .updateTable("organizations")
    .set((expression) => ({
      mutationRevision: expression("mutationRevision", "+", 1),
      updatedAt: new Date(),
    }))
    .where("id", "=", organizationId)
    .where("status", "=", "ACTIVE")
    .where("suspended", "=", false)
    .returning("id")
    .executeTakeFirst();
  if (!result) {
    throw new OrganizationMutationBlockedError();
  }
}
