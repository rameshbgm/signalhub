import type { ClientSession } from "mongodb";

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
  work: (session: ClientSession) => Promise<T>
): Promise<T> {
  const { db, mongoClient } = await import("./db");
  const locks = db.collection<{ _id: string; revision: number; createdAt: Date; updatedAt?: Date }>("identityInvariantLocks");
  await locks.updateOne(
    { _id: "active-admin" },
    { $setOnInsert: { revision: 0, createdAt: new Date() } },
    { upsert: true }
  );
  const databaseSession = mongoClient.startSession();
  let result: T;
  try {
    await databaseSession.withTransaction(async () => {
      const acquired = await locks.updateOne(
        { _id: "active-admin" },
        { $inc: { revision: 1 }, $set: { updatedAt: new Date() } },
        { session: databaseSession }
      );
      if (!acquired.matchedCount) throw new Error("Admin invariant lock is unavailable");
      result = await work(databaseSession);
    });
  } finally {
    await databaseSession.endSession();
  }
  return result!;
}
