import { ObjectId, type ClientSession, type WithId } from "mongodb";
import { collections, mongoClient, type PlatformJobDoc } from "@/lib/db";
import { deleteOrgCascade } from "@/lib/cascade";
import { writePlatformAudit } from "@/lib/platform-policy";
import { startLeaseHeartbeat } from "@/worker/lease-heartbeat";

const LEASE_MILLISECONDS = 5 * 60_000;
const LEASE_RENEWAL_MILLISECONDS = 60_000;

class PlatformJobLeaseLostError extends Error {
  constructor() {
    super("Platform purge job lease is no longer owned by this worker");
    this.name = "PlatformJobLeaseLostError";
  }
}

async function leasePlatformJob(workerId: string) {
  const now = new Date();
  return collections.platformJobs().findOneAndUpdate(
    {
      type: "PURGE_ORGANIZATION",
      $expr: { $lt: ["$attempts", "$maxAttempts"] },
      nextAttemptAt: { $lte: now },
      $or: [
        { status: { $in: ["QUEUED", "FAILED"] } },
        { status: "PROCESSING", leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "PROCESSING",
        leaseOwner: workerId,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
        startedAt: now,
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: "after" }
  );
}

async function renewPlatformJobLease(jobId: ObjectId, workerId: string) {
  const now = new Date();
  const renewed = await collections.platformJobs().updateOne(
    {
      _id: jobId,
      status: "PROCESSING",
      leaseOwner: workerId,
    },
    {
      $set: {
        leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
        updatedAt: now,
      },
    }
  );
  if (renewed.matchedCount !== 1) throw new PlatformJobLeaseLostError();
}

async function completePurge(
  job: WithId<PlatformJobDoc>,
  workerId: string,
  beforeFinalize: () => Promise<void>
) {
  await deleteOrgCascade(job.organizationId.toHexString(), {
    initialScope: job.purgeScope,
    recordScope: async (scope, session) => {
      const recorded = await collections.platformJobs().updateOne(
        { _id: job._id, status: "PROCESSING", leaseOwner: workerId },
        { $set: { purgeScope: scope, updatedAt: new Date() } },
        { session }
      );
      if (recorded.matchedCount !== 1) {
        throw new PlatformJobLeaseLostError();
      }
    },
    beforeFinalize,
    finalize: async (session, purgeScope) => {
      const now = new Date();
      await collections.organizationTombstones().updateOne(
        { organizationId: job.organizationId },
        {
          $setOnInsert: {
            _id: new ObjectId(),
            organizationId: job.organizationId,
            slug: job.organizationSlug,
            name: job.organizationName,
            requestedBy: job.requestedBy,
            reason: job.reason,
            purgedAt: now,
            purgeScope,
          },
        },
        { upsert: true, session }
      );
      const completed = await collections.platformJobs().updateOne(
        { _id: job._id, status: "PROCESSING", leaseOwner: workerId },
        {
          $set: {
            status: "SUCCEEDED",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            completedAt: now,
            updatedAt: now,
          },
        },
        { session }
      );
      if (completed.matchedCount !== 1) throw new PlatformJobLeaseLostError();
      await writePlatformAudit(
        {
          actorId: null,
          actorEmail: "system@status",
          actorRole: "SYSTEM",
          action: "ORGANIZATION_PURGE_SUCCEEDED",
          targetType: "organization",
          targetId: job.organizationId.toHexString(),
          organizationId: job.organizationId,
          reason: job.reason,
          metadata: { jobId: job._id.toHexString(), slug: job.organizationSlug },
        },
        { session }
      );
    },
  });
}

async function failPurge(job: WithId<PlatformJobDoc>, workerId: string, error: unknown) {
  const now = new Date();
  const terminal = job.attempts >= job.maxAttempts;
  const message = error instanceof Error ? error.message : "Organization purge failed";
  await withJobTransaction(async (session) => {
    const failed = await collections.platformJobs().updateOne(
      { _id: job._id, status: "PROCESSING", leaseOwner: workerId },
      {
        $set: {
          status: terminal ? "FAILED" : "QUEUED",
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: message,
          nextAttemptAt: terminal
            ? new Date("9999-12-31T23:59:59.999Z")
            : new Date(now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** job.attempts)),
          updatedAt: now,
        },
      },
      { session }
    );
    if (failed.matchedCount !== 1) return;
    await writePlatformAudit(
      {
        actorId: null,
        actorEmail: "system@status",
        actorRole: "SYSTEM",
        action: terminal
          ? "ORGANIZATION_PURGE_EXHAUSTED"
          : "ORGANIZATION_PURGE_ATTEMPT_FAILED",
        targetType: "organization",
        targetId: job.organizationId.toHexString(),
        organizationId: job.organizationId,
        reason: job.reason,
        metadata: {
          jobId: job._id.toHexString(),
          attempt: job.attempts,
          error: message,
        },
      },
      { session }
    );
  });
}

async function withJobTransaction(
  callback: (session: ClientSession) => Promise<void>
) {
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(() => callback(session));
  } finally {
    await session.endSession();
  }
}

export async function drainPlatformJobs(workerId: string, limit = 1) {
  let processed = 0;
  while (processed < limit) {
    const job = await leasePlatformJob(workerId);
    if (!job) break;
    const heartbeat = startLeaseHeartbeat(
      () => renewPlatformJobLease(job._id, workerId),
      LEASE_RENEWAL_MILLISECONDS
    );
    try {
      await completePurge(job, workerId, async () => {
        // Stop any in-flight timer renewal, then atomically prove ownership and
        // extend the lease before writing the tombstone and terminal status.
        await heartbeat.stop();
        await renewPlatformJobLease(job._id, workerId);
      });
    } catch (error) {
      await heartbeat.stop();
      await failPurge(job, workerId, error);
    }
    processed += 1;
  }
  return processed;
}
