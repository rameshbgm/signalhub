import type { ClientSession } from "mongodb";

type MembershipOwnerState = {
  role: string;
  status?: string;
};

export function isActiveOwner(state: MembershipOwnerState) {
  return (
    state.role === "OWNER" &&
    state.status !== "REVOKED" &&
    state.status !== "INVITED"
  );
}

export function transitionRemovesActiveOwner(
  current: MembershipOwnerState,
  next: Partial<MembershipOwnerState>
) {
  return isActiveOwner(current) && !isActiveOwner({ ...current, ...next });
}

/**
 * Serializes membership transitions that can affect the Owner invariant.
 * The organization fence is the transaction's first write, so concurrent
 * Owner changes and lifecycle transitions retry from a fresh snapshot before
 * counting Owners.
 */
export async function withOrganizationOwnerInvariantTransaction<T>(
  organizationId: string,
  work: (session: ClientSession) => Promise<T>
): Promise<T> {
  const [{ mongoClient }, { fenceActiveOrganizationMutation }] =
    await Promise.all([
      import("./db"),
      import("./organization-mutation"),
    ]);
  const databaseSession = mongoClient.startSession();
  let result: T;
  try {
    await databaseSession.withTransaction(async () => {
      await fenceActiveOrganizationMutation(
        organizationId,
        databaseSession
      );
      result = await work(databaseSession);
    });
  } finally {
    await databaseSession.endSession();
  }
  return result!;
}
