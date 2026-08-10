import { createHash } from "node:crypto";
import { database, withDatabaseTransaction, type DatabaseTransaction } from "@/lib/postgres/client";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

type AuditEntry = Record<string, unknown> & { id: string };

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !["previousHash", "entryHash", "chainSequence"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

function calculateEntryHash(previousHash: string | null, entry: AuditEntry) {
  return createHash("sha256")
    .update(previousHash ?? "GENESIS")
    .update("\n")
    .update(JSON.stringify(canonical(entry)))
    .digest("hex");
}

async function lockedChainState(transaction: DatabaseTransaction, scope: string) {
  await transaction.insertInto("auditChainStates")
    .values({ id: scope, latestHash: null, sequence: 0, retainedSequence: null, retainedPreviousHash: null })
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();
  return transaction.selectFrom("auditChainStates")
    .selectAll()
    .where("id", "=", scope)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

async function sealScope(scope: string, organizationId?: string) {
  return withDatabaseTransaction(async (transaction) => {
    const state = await lockedChainState(transaction, scope);
    let previousHash = state.latestHash;
    let sequence = Number(state.sequence);
    const entries = organizationId
      ? await transaction.selectFrom("auditLogs").selectAll()
          .where("orgId", "=", organizationId).where("entryHash", "is", null)
          .orderBy("createdAt").orderBy("id").limit(500).forUpdate().execute()
      : await transaction.selectFrom("platformAuditLogs").selectAll()
          .where("entryHash", "is", null)
          .orderBy("createdAt").orderBy("id").limit(500).forUpdate().execute();
    if (!entries.length) return 0;

    const sinksQuery = transaction.selectFrom("auditSinks").select(["id"])
      .where("enabled", "=", true);
    const sinks = organizationId
      ? await sinksQuery.where("orgId", "=", organizationId).execute()
      : await sinksQuery.where("orgId", "is", null).execute();

    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as AuditEntry;
      sequence += 1;
      const hash = calculateEntryHash(previousHash, entry);
      const updated = organizationId
        ? await transaction.updateTable("auditLogs")
            .set({ previousHash, entryHash: hash, chainSequence: sequence })
            .where("id", "=", entry.id).where("entryHash", "is", null)
            .returning("id").executeTakeFirst()
        : await transaction.updateTable("platformAuditLogs")
            .set({ previousHash, entryHash: hash, chainSequence: sequence })
            .where("id", "=", entry.id).where("entryHash", "is", null)
            .returning("id").executeTakeFirst();
      if (!updated) throw new Error("Audit chain changed while sealing");

      for (const sink of sinks) {
        const deduplicationKey = `${sink.id}:${entry.id}`;
        await transaction.insertInto("auditDeliveryJobs").values({
          sinkId: sink.id,
          deduplicationKey,
          payload: { scope, entry: canonical(entry), previousHash, entryHash: hash, chainSequence: sequence },
          status: "PENDING",
          attempts: 0,
          maxAttempts: 8,
          nextAttemptAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          responseStatus: null,
          sentAt: null,
        }).onConflict((conflict) => conflict.column("deduplicationKey").doNothing()).execute();
      }
      previousHash = hash;
    }

    await transaction.updateTable("auditChainStates")
      .set({ latestHash: previousHash, sequence, updatedAt: new Date() })
      .where("id", "=", scope)
      .execute();
    if (sinks.length) {
      await enqueueJobSweep(transaction, JOB_TASKS.auditDelivery);
    }
    return entries.length;
  });
}

export async function sealAuditEntries() {
  let sealed = await sealScope("platform");
  const organizations = await database.selectFrom("auditLogs")
    .select("orgId").where("entryHash", "is", null).groupBy("orgId").execute();
  for (const organization of organizations) {
    sealed += await sealScope(`organization:${organization.orgId}`, organization.orgId);
  }
  return sealed;
}

export async function verifyAuditScope(organizationId?: string) {
  const scope = organizationId ? `organization:${organizationId}` : "platform";
  const state = await database.selectFrom("auditChainStates").selectAll()
    .where("id", "=", scope).executeTakeFirst();
  const entries = organizationId
    ? await database.selectFrom("auditLogs").selectAll()
        .where("orgId", "=", organizationId).where("entryHash", "is not", null)
        .orderBy("chainSequence").execute()
    : await database.selectFrom("platformAuditLogs").selectAll()
        .where("entryHash", "is not", null).orderBy("chainSequence").execute();
  let previousHash = state?.retainedPreviousHash ?? null;
  let expectedSequence = Number(state?.retainedSequence ?? 1);
  for (const rawEntry of entries) {
    const entry = rawEntry as unknown as AuditEntry & {
      chainSequence: number | null;
      previousHash: string | null;
      entryHash: string | null;
    };
    if (
      Number(entry.chainSequence) !== expectedSequence ||
      entry.previousHash !== previousHash ||
      entry.entryHash !== calculateEntryHash(previousHash, entry)
    ) {
      return { valid: false, checked: expectedSequence - 1, failedId: entry.id, unsealed: 0 };
    }
    previousHash = entry.entryHash;
    expectedSequence += 1;
  }
  const unsealedRow = organizationId
    ? await database.selectFrom("auditLogs").select(({ fn }) => fn.countAll<number>().as("count"))
        .where("orgId", "=", organizationId).where("entryHash", "is", null).executeTakeFirstOrThrow()
    : await database.selectFrom("platformAuditLogs").select(({ fn }) => fn.countAll<number>().as("count"))
        .where("entryHash", "is", null).executeTakeFirstOrThrow();
  const stateMatches = !state || (
    previousHash === state.latestHash && expectedSequence - 1 === Number(state.sequence)
  );
  return {
    valid: stateMatches,
    checked: entries.length,
    failedId: stateMatches ? null : "chain-tail",
    unsealed: Number(unsealedRow.count),
  };
}

export async function pruneAuditBefore(before: Date, organizationId?: string) {
  const scope = organizationId ? `organization:${organizationId}` : "platform";
  return withDatabaseTransaction(async (transaction) => {
    await lockedChainState(transaction, scope);
    const lastRemoved = organizationId
      ? await transaction.selectFrom("auditLogs").select(["entryHash", "chainSequence"])
          .where("orgId", "=", organizationId).where("createdAt", "<", before)
          .where("entryHash", "is not", null).where("chainSequence", ">", 0)
          .orderBy("chainSequence", "desc").executeTakeFirst()
      : await transaction.selectFrom("platformAuditLogs").select(["entryHash", "chainSequence"])
          .where("createdAt", "<", before).where("entryHash", "is not", null)
          .where("chainSequence", ">", 0).orderBy("chainSequence", "desc").executeTakeFirst();
    if (!lastRemoved?.entryHash || !lastRemoved.chainSequence) return 0;

    const result = organizationId
      ? await transaction.deleteFrom("auditLogs")
          .where("orgId", "=", organizationId)
          .where("chainSequence", "<=", lastRemoved.chainSequence).executeTakeFirst()
      : await transaction.deleteFrom("platformAuditLogs")
          .where("chainSequence", "<=", lastRemoved.chainSequence).executeTakeFirst();
    await transaction.updateTable("auditChainStates").set({
      retainedSequence: Number(lastRemoved.chainSequence) + 1,
      retainedPreviousHash: lastRemoved.entryHash,
      updatedAt: new Date(),
    }).where("id", "=", scope).execute();
    return Number(result.numDeletedRows);
  });
}
