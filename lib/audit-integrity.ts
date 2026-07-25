import { createHash } from "node:crypto";
import { ObjectId, type Document } from "mongodb";
import { collections, mongoClient } from "@/lib/db";

function canonical(value: unknown): unknown {
  if (value instanceof ObjectId) return value.toHexString();
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

function entryHash(previousHash: string | null, entry: Document) {
  return createHash("sha256")
    .update(previousHash ?? "GENESIS")
    .update("\n")
    .update(JSON.stringify(canonical(entry)))
    .digest("hex");
}

async function sealScope(scope: string, organizationId?: ObjectId) {
  const session = mongoClient.startSession();
  try {
    let sealed = 0;
    await session.withTransaction(async () => {
      const state = await collections.auditChainStates().findOne({ _id: scope }, { session });
      let previousHash = state?.latestHash ?? null;
      let sequence = state?.sequence ?? 0;
      const entries = organizationId
        ? await collections.auditLogs().find(
            { orgId: organizationId, entryHash: { $in: [null, undefined] } },
            { session }
          ).sort({ createdAt: 1, _id: 1 }).limit(500).toArray()
        : await collections.platformAuditLogs().find(
            { entryHash: { $in: [null, undefined] } },
            { session }
          ).sort({ createdAt: 1, _id: 1 }).limit(500).toArray();
      const sinks = entries.length
        ? await collections.auditSinks().find(
            { enabled: true, orgId: organizationId ?? null },
            { session }
          ).toArray()
        : [];
      for (const entry of entries) {
        sequence += 1;
        const hash = entryHash(previousHash, entry);
        const target = organizationId ? collections.auditLogs() : collections.platformAuditLogs();
        const updated = await target.updateOne(
          { _id: entry._id, entryHash: { $in: [null, undefined] } },
          { $set: { previousHash, entryHash: hash, chainSequence: sequence } },
          { session }
        );
        if (!updated.modifiedCount) throw new Error("Audit chain changed while sealing");
        for (const sink of sinks) {
          const deduplicationKey = `${sink._id.toHexString()}:${entry._id.toHexString()}`;
          const now = new Date();
          await collections.auditDeliveryJobs().updateOne(
            { deduplicationKey },
            {
              $setOnInsert: {
                _id: new ObjectId(),
                sinkId: sink._id,
                deduplicationKey,
                payload: {
                  scope,
                  entry: canonical(entry) as Record<string, unknown>,
                  previousHash,
                  entryHash: hash,
                  chainSequence: sequence,
                },
                status: "PENDING",
                attempts: 0,
                maxAttempts: 8,
                nextAttemptAt: now,
                leaseOwner: null,
                leaseExpiresAt: null,
                lastError: null,
                responseStatus: null,
                createdAt: now,
                updatedAt: now,
                sentAt: null,
              },
            },
            { upsert: true, session }
          );
        }
        previousHash = hash;
        sealed += 1;
      }
      if (entries.length) {
        await collections.auditChainStates().updateOne(
          { _id: scope },
          { $set: { latestHash: previousHash, sequence, updatedAt: new Date() } },
          { upsert: true, session }
        );
      }
    });
    return sealed;
  } finally {
    await session.endSession();
  }
}

export async function sealAuditEntries() {
  let sealed = await sealScope("platform");
  const orgIds = await collections.auditLogs().distinct("orgId", {
    entryHash: { $in: [null, undefined] },
  });
  for (const orgId of orgIds) {
    sealed += await sealScope(`organization:${orgId.toHexString()}`, orgId);
  }
  return sealed;
}

export async function verifyAuditScope(organizationId?: ObjectId) {
  const scope = organizationId ? `organization:${organizationId.toHexString()}` : "platform";
  const state = await collections.auditChainStates().findOne({ _id: scope });
  const entries = organizationId
    ? await collections.auditLogs().find(
        { orgId: organizationId, entryHash: { $type: "string" } }
      ).sort({ chainSequence: 1 }).toArray()
    : await collections.platformAuditLogs().find(
        { entryHash: { $type: "string" } }
      ).sort({ chainSequence: 1 }).toArray();
  let previousHash: string | null = state?.retainedPreviousHash ?? null;
  let expectedSequence = state?.retainedSequence ?? 1;
  for (const entry of entries) {
    if (
      entry.chainSequence !== expectedSequence ||
      entry.previousHash !== previousHash ||
      entry.entryHash !== entryHash(previousHash, entry)
    ) {
      return {
        valid: false,
        checked: expectedSequence - 1,
        failedId: entry._id.toHexString(),
        unsealed: 0,
      };
    }
    previousHash = entry.entryHash;
    expectedSequence += 1;
  }
  const unsealed = organizationId
    ? await collections.auditLogs().countDocuments({
        orgId: organizationId,
        entryHash: { $in: [null, undefined] },
      })
    : await collections.platformAuditLogs().countDocuments({
        entryHash: { $in: [null, undefined] },
      });
  const stateMatches =
    !state ||
    (previousHash === state.latestHash && expectedSequence - 1 === state.sequence);
  return {
    valid: stateMatches,
    checked: entries.length,
    failedId: stateMatches ? null : "chain-tail",
    unsealed,
  };
}

export async function pruneAuditBefore(before: Date, organizationId?: ObjectId) {
  const scope = organizationId ? `organization:${organizationId.toHexString()}` : "platform";
  const session = mongoClient.startSession();
  try {
    let removed = 0;
    await session.withTransaction(async () => {
      const lastRemoved = organizationId
        ? await collections.auditLogs().findOne(
            {
              orgId: organizationId,
              createdAt: { $lt: before },
              entryHash: { $type: "string" },
              chainSequence: { $gt: 0 },
            },
            { session, sort: { chainSequence: -1 } }
          )
        : await collections.platformAuditLogs().findOne(
            {
              createdAt: { $lt: before },
              entryHash: { $type: "string" },
              chainSequence: { $gt: 0 },
            },
            { session, sort: { chainSequence: -1 } }
          );
      if (!lastRemoved?.entryHash || !lastRemoved.chainSequence) return;
      const result = organizationId
        ? await collections.auditLogs().deleteMany(
            {
              orgId: organizationId,
              chainSequence: { $lte: lastRemoved.chainSequence },
            },
            { session }
          )
        : await collections.platformAuditLogs().deleteMany(
            { chainSequence: { $lte: lastRemoved.chainSequence } },
            { session }
          );
      removed = result.deletedCount;
      await collections.auditChainStates().updateOne(
        { _id: scope },
        {
          $set: {
            retainedSequence: lastRemoved.chainSequence + 1,
            retainedPreviousHash: lastRemoved.entryHash,
            updatedAt: new Date(),
          },
        },
        { upsert: true, session }
      );
    });
    return removed;
  } finally {
    await session.endSession();
  }
}
