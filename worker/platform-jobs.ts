import { sql } from "kysely";
import { deleteOrgCascade, type OrganizationPurgeScope } from "@/lib/cascade";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { PlatformJobRow } from "@/lib/postgres/schema";
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
  return withDatabaseTransaction(async (transaction) => {
    const now = new Date();
    const job = await transaction.selectFrom("platformJobs").selectAll()
      .where("type", "=", "PURGE_ORGANIZATION")
      .where((expression) => expression("attempts", "<", expression.ref("maxAttempts")))
      .where("nextAttemptAt", "<=", now)
      .where((expression) => expression.or([
        expression("status", "in", ["QUEUED", "FAILED"]),
        expression.and([
          expression("status", "=", "PROCESSING"),
          expression("leaseExpiresAt", "<=", now),
        ]),
      ]))
      .orderBy("nextAttemptAt")
      .orderBy("createdAt")
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();
    if (!job) return null;
    return transaction.updateTable("platformJobs").set({
      status: "PROCESSING",
      leaseOwner: workerId,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
      startedAt: now,
      updatedAt: now,
      attempts: sql<number>`attempts + 1`,
    }).where("id", "=", job.id).returningAll().executeTakeFirstOrThrow();
  });
}

async function renewPlatformJobLease(jobId: string, workerId: string) {
  const now = new Date();
  const renewed = await database.updateTable("platformJobs").set({
    leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
    updatedAt: now,
  }).where("id", "=", jobId)
    .where("status", "=", "PROCESSING")
    .where("leaseOwner", "=", workerId)
    .returning("id").executeTakeFirst();
  if (!renewed) throw new PlatformJobLeaseLostError();
}

async function completePurge(
  job: PlatformJobRow,
  workerId: string,
  beforeFinalize: () => Promise<void>
) {
  await deleteOrgCascade(job.organizationId, {
    initialScope: job.purgeScope,
    recordScope: async (scope, transaction) => {
      const recorded = await transaction.updateTable("platformJobs")
        .set({ purgeScope: scope, updatedAt: new Date() })
        .where("id", "=", job.id)
        .where("status", "=", "PROCESSING")
        .where("leaseOwner", "=", workerId)
        .returning("id").executeTakeFirst();
      if (!recorded) throw new PlatformJobLeaseLostError();
    },
    beforeFinalize,
    finalize: async (transaction, purgeScope: OrganizationPurgeScope) => {
      const now = new Date();
      await transaction.insertInto("organizationTombstones").values({
        organizationId: job.organizationId,
        slug: job.organizationSlug,
        name: job.organizationName,
        requestedBy: job.requestedBy,
        reason: job.reason,
        purgedAt: now,
        purgeScope,
      }).onConflict((conflict) => conflict.column("organizationId").doNothing()).execute();
      const completed = await transaction.updateTable("platformJobs").set({
        status: "SUCCEEDED",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        completedAt: now,
        updatedAt: now,
      }).where("id", "=", job.id)
        .where("status", "=", "PROCESSING")
        .where("leaseOwner", "=", workerId)
        .returning("id").executeTakeFirst();
      if (!completed) throw new PlatformJobLeaseLostError();
      await writePlatformAudit({
        actorId: null,
        actorEmail: "system@signalhub",
        actorRole: "SYSTEM",
        action: "ORGANIZATION_PURGE_SUCCEEDED",
        targetType: "organization",
        targetId: job.organizationId,
        organizationId: job.organizationId,
        reason: job.reason,
        metadata: { jobId: job.id, slug: job.organizationSlug },
      }, { executor: transaction });
    },
  });
}

async function failPurge(job: PlatformJobRow, workerId: string, error: unknown) {
  const now = new Date();
  const terminal = job.attempts >= job.maxAttempts;
  const message = error instanceof Error ? error.message : "Organization purge failed";
  await withDatabaseTransaction(async (transaction) => {
    const failed = await transaction.updateTable("platformJobs").set({
      status: terminal ? "FAILED" : "QUEUED",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: message,
      nextAttemptAt: terminal
        ? new Date("9999-12-31T23:59:59.999Z")
        : new Date(now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** job.attempts)),
      updatedAt: now,
    }).where("id", "=", job.id)
      .where("status", "=", "PROCESSING")
      .where("leaseOwner", "=", workerId)
      .returning("id").executeTakeFirst();
    if (!failed) return;
    await writePlatformAudit({
      actorId: null,
      actorEmail: "system@signalhub",
      actorRole: "SYSTEM",
      action: terminal ? "ORGANIZATION_PURGE_EXHAUSTED" : "ORGANIZATION_PURGE_ATTEMPT_FAILED",
      targetType: "organization",
      targetId: job.organizationId,
      organizationId: job.organizationId,
      reason: job.reason,
      metadata: { jobId: job.id, attempt: job.attempts, error: message },
    }, { executor: transaction });
  });
}

export async function drainPlatformJobs(workerId: string, limit = 1) {
  let processed = 0;
  while (processed < limit) {
    const job = await leasePlatformJob(workerId);
    if (!job) break;
    const heartbeat = startLeaseHeartbeat(
      () => renewPlatformJobLease(job.id, workerId),
      LEASE_RENEWAL_MILLISECONDS
    );
    try {
      await completePurge(job, workerId, async () => {
        await heartbeat.stop();
        await renewPlatformJobLease(job.id, workerId);
      });
    } catch (error) {
      await heartbeat.stop();
      await failPurge(job, workerId, error);
    }
    processed += 1;
  }
  return processed;
}
