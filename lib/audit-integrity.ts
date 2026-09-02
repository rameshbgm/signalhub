import { createHash } from "node:crypto";
import { database, withDatabaseTransaction, type DatabaseTransaction } from "@/lib/postgres/client";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";

type AuditEntry = Record<string, unknown> & { id: string };

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["previousHash", "entryHash", "chainSequence"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function calculateEntryHash(previousHash: string | null, entry: AuditEntry) {
  return createHash("sha256").update(previousHash ?? "GENESIS").update("\n")
    .update(JSON.stringify(canonical(entry))).digest("hex");
}

async function lockedChainState(transaction: DatabaseTransaction) {
  await transaction.insertInto("auditChainStates")
    .values({ id: "platform", latestHash: null, sequence: 0, retainedSequence: null, retainedPreviousHash: null })
    .onConflict((conflict) => conflict.column("id").doNothing()).execute();
  return transaction.selectFrom("auditChainStates").selectAll().where("id", "=", "platform").forUpdate().executeTakeFirstOrThrow();
}

export async function sealAuditEntries() {
  return withDatabaseTransaction(async (transaction) => {
    const state = await lockedChainState(transaction);
    let previousHash = state.latestHash;
    let sequence = Number(state.sequence);
    const entries = await transaction.selectFrom("platformAuditLogs").selectAll()
      .where("entryHash", "is", null).orderBy("createdAt").orderBy("id").limit(500).forUpdate().execute();
    if (!entries.length) return 0;
    const sinks = await transaction.selectFrom("auditSinks").select(["id"]).where("enabled", "=", true).where("orgId", "is", null).execute();
    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as AuditEntry;
      sequence += 1;
      const hash = calculateEntryHash(previousHash, entry);
      const updated = await transaction.updateTable("platformAuditLogs")
        .set({ previousHash, entryHash: hash, chainSequence: sequence })
        .where("id", "=", entry.id).where("entryHash", "is", null).returning("id").executeTakeFirst();
      if (!updated) throw new Error("Audit chain changed while sealing");
      for (const sink of sinks) {
        await transaction.insertInto("auditDeliveryJobs").values({
          sinkId: sink.id, deduplicationKey: `${sink.id}:${entry.id}`,
          payload: { scope: "platform", entry: canonical(entry), previousHash, entryHash: hash, chainSequence: sequence },
          status: "PENDING", attempts: 0, maxAttempts: 8, nextAttemptAt: new Date(), leaseOwner: null,
          leaseExpiresAt: null, lastError: null, responseStatus: null, sentAt: null,
        }).onConflict((conflict) => conflict.column("deduplicationKey").doNothing()).execute();
      }
      previousHash = hash;
    }
    await transaction.updateTable("auditChainStates").set({ latestHash: previousHash, sequence, updatedAt: new Date() })
      .where("id", "=", "platform").execute();
    if (sinks.length) await enqueueJobSweep(transaction, JOB_TASKS.auditDelivery);
    return entries.length;
  });
}

export async function verifyAuditScope() {
  const state = await database.selectFrom("auditChainStates").selectAll().where("id", "=", "platform").executeTakeFirst();
  const entries = await database.selectFrom("platformAuditLogs").selectAll().where("entryHash", "is not", null).orderBy("chainSequence").execute();
  let previousHash = state?.retainedPreviousHash ?? null;
  let expectedSequence = Number(state?.retainedSequence ?? 1);
  for (const rawEntry of entries) {
    const entry = rawEntry as unknown as AuditEntry & { chainSequence: number | null; previousHash: string | null; entryHash: string | null };
    if (Number(entry.chainSequence) !== expectedSequence || entry.previousHash !== previousHash || entry.entryHash !== calculateEntryHash(previousHash, entry)) {
      return { valid: false, checked: expectedSequence - 1, failedId: entry.id, unsealed: 0 };
    }
    previousHash = entry.entryHash;
    expectedSequence += 1;
  }
  const unsealed = await database.selectFrom("platformAuditLogs").select(({ fn }) => fn.countAll<number>().as("count"))
    .where("entryHash", "is", null).executeTakeFirstOrThrow();
  const valid = !state || (previousHash === state.latestHash && expectedSequence - 1 === Number(state.sequence));
  return { valid, checked: entries.length, failedId: valid ? null : "chain-tail", unsealed: Number(unsealed.count) };
}

export async function pruneAuditBefore(before: Date) {
  return withDatabaseTransaction(async (transaction) => {
    await lockedChainState(transaction);
    const lastRemoved = await transaction.selectFrom("platformAuditLogs").select(["entryHash", "chainSequence"])
      .where("createdAt", "<", before).where("entryHash", "is not", null).where("chainSequence", ">", 0)
      .orderBy("chainSequence", "desc").executeTakeFirst();
    if (!lastRemoved?.entryHash || !lastRemoved.chainSequence) return 0;
    const result = await transaction.deleteFrom("platformAuditLogs").where("chainSequence", "<=", lastRemoved.chainSequence).executeTakeFirst();
    await transaction.updateTable("auditChainStates").set({ retainedSequence: Number(lastRemoved.chainSequence) + 1, retainedPreviousHash: lastRemoved.entryHash, updatedAt: new Date() })
      .where("id", "=", "platform").execute();
    return Number(result.numDeletedRows);
  });
}
