import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const platformJobState = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  leaseReturned: false,
  organizationExists: true,
  cascadeError: null as Error | null,
  completionMatchedCount: 1,
  failureMatchedCount: 1,
  jobUpdates: [] as Array<{
    filter: Record<string, unknown>;
    update: { $set?: Record<string, unknown> };
  }>,
  tombstoneUpdates: 0,
  audits: [] as Array<Record<string, unknown>>,
  auditSessions: [] as unknown[],
  tombstoneSessions: [] as unknown[],
  jobUpdateSessions: [] as unknown[],
  transactionSessions: [] as unknown[],
  heartbeatStops: 0,
}));

vi.mock("@/lib/db", () => ({
  mongoClient: {
    startSession: () => {
      const session = {
        withTransaction: async (callback: () => Promise<void>) => callback(),
        endSession: async () => undefined,
      };
      platformJobState.transactionSessions.push(session);
      return session;
    },
  },
  collections: {
    platformJobs: () => ({
      findOneAndUpdate: async () => {
        if (platformJobState.leaseReturned) return null;
        platformJobState.leaseReturned = true;
        return platformJobState.job;
      },
      updateOne: async (
        filter: Record<string, unknown>,
        update: { $set?: Record<string, unknown> },
        options?: { session?: unknown }
      ) => {
        platformJobState.jobUpdates.push({ filter, update });
        platformJobState.jobUpdateSessions.push(options?.session);
        const status = update.$set?.status;
        if (status === "SUCCEEDED") {
          return { matchedCount: platformJobState.completionMatchedCount };
        }
        if (status === "QUEUED" || status === "FAILED") {
          return { matchedCount: platformJobState.failureMatchedCount };
        }
        return { matchedCount: 1 };
      },
    }),
    organizations: () => ({
      findOne: async () =>
        platformJobState.organizationExists ? { _id: new ObjectId() } : null,
    }),
    organizationTombstones: () => ({
      updateOne: async (
        _filter: unknown,
        _update: unknown,
        options?: { session?: unknown }
      ) => {
        platformJobState.tombstoneUpdates += 1;
        platformJobState.tombstoneSessions.push(options?.session);
        return { matchedCount: 1 };
      },
    }),
  },
}));

vi.mock("@/lib/cascade", () => ({
  deleteOrgCascade: async (
    _organizationId: string,
    options?: {
      beforeFinalize?: () => Promise<void>;
      recordScope?: (
        scope: Record<string, unknown>,
        session: unknown
      ) => Promise<void>;
      finalize?: (
        session: unknown,
        scope: Record<string, unknown>
      ) => Promise<void>;
    }
  ) => {
    if (platformJobState.cascadeError) throw platformJobState.cascadeError;
    const session = { type: "cascade-session" };
    const scope = {
      pageIds: [],
      componentIds: [],
      incidentIds: [],
      metricIds: [],
      monitorIds: [],
    };
    await options?.recordScope?.(scope, session);
    await options?.beforeFinalize?.();
    await options?.finalize?.(session, scope);
  },
}));

vi.mock("@/lib/platform-policy", () => ({
  writePlatformAudit: async (
    entry: Record<string, unknown>,
    options?: { session?: unknown }
  ) => {
    platformJobState.audits.push(entry);
    platformJobState.auditSessions.push(options?.session);
  },
}));

vi.mock("@/worker/lease-heartbeat", () => ({
  startLeaseHeartbeat: () => ({
    stop: async () => {
      platformJobState.heartbeatStops += 1;
    },
  }),
}));

import { drainPlatformJobs } from "../worker/platform-jobs";

function purgeJob(attempts: number, maxAttempts: number) {
  const now = new Date();
  return {
    _id: new ObjectId(),
    type: "PURGE_ORGANIZATION",
    status: "PROCESSING",
    organizationId: new ObjectId(),
    organizationSlug: "sample",
    organizationName: "Sample",
    requestedBy: new ObjectId(),
    reason: "test purge",
    attempts,
    maxAttempts,
    nextAttemptAt: now,
    leaseOwner: "worker-a",
    leaseExpiresAt: new Date(now.getTime() + 300_000),
    lastError: null,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: null,
  };
}

describe("platform purge jobs", () => {
  beforeEach(() => {
    platformJobState.job = null;
    platformJobState.leaseReturned = false;
    platformJobState.organizationExists = true;
    platformJobState.cascadeError = null;
    platformJobState.completionMatchedCount = 1;
    platformJobState.failureMatchedCount = 1;
    platformJobState.jobUpdates.length = 0;
    platformJobState.tombstoneUpdates = 0;
    platformJobState.audits.length = 0;
    platformJobState.auditSessions.length = 0;
    platformJobState.tombstoneSessions.length = 0;
    platformJobState.jobUpdateSessions.length = 0;
    platformJobState.transactionSessions.length = 0;
    platformJobState.heartbeatStops = 0;
  });

  it("returns transient failures to the queue with a scheduled backoff", async () => {
    platformJobState.job = purgeJob(1, 5);
    platformJobState.cascadeError = new Error("temporary storage failure");

    await expect(drainPlatformJobs("worker-a")).resolves.toBe(1);

    const retryUpdate = platformJobState.jobUpdates.find(
      ({ update }) => update.$set?.status === "QUEUED"
    );
    expect(retryUpdate?.update.$set).toMatchObject({
      status: "QUEUED",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: "temporary storage failure",
      nextAttemptAt: expect.any(Date),
    });
    expect(platformJobState.audits).toContainEqual(
      expect.objectContaining({ action: "ORGANIZATION_PURGE_ATTEMPT_FAILED" })
    );
    const failureAuditIndex = platformJobState.audits.findIndex(
      (entry) => entry.action === "ORGANIZATION_PURGE_ATTEMPT_FAILED"
    );
    const failureUpdateIndex = platformJobState.jobUpdates.findIndex(
      ({ update }) => update.$set?.status === "QUEUED"
    );
    expect(platformJobState.auditSessions[failureAuditIndex]).toBe(
      platformJobState.jobUpdateSessions[failureUpdateIndex]
    );
  });

  it("reserves FAILED for exhausted jobs", async () => {
    platformJobState.job = purgeJob(5, 5);
    platformJobState.cascadeError = new Error("permanent failure");

    await expect(drainPlatformJobs("worker-a")).resolves.toBe(1);

    const terminalUpdate = platformJobState.jobUpdates.find(
      ({ update }) => update.$set?.status === "FAILED"
    );
    expect(terminalUpdate?.update.$set).toMatchObject({
      status: "FAILED",
      nextAttemptAt: new Date("9999-12-31T23:59:59.999Z"),
    });
    expect(platformJobState.audits).toContainEqual(
      expect.objectContaining({ action: "ORGANIZATION_PURGE_EXHAUSTED" })
    );
  });

  it("does not write a success audit after losing the lease at completion", async () => {
    platformJobState.job = purgeJob(1, 5);
    platformJobState.organizationExists = false;
    platformJobState.completionMatchedCount = 0;
    platformJobState.failureMatchedCount = 0;

    await expect(drainPlatformJobs("worker-a")).resolves.toBe(1);

    expect(platformJobState.jobUpdates).toContainEqual(
      expect.objectContaining({
        filter: expect.objectContaining({
          status: "PROCESSING",
          leaseOwner: "worker-a",
        }),
        update: expect.objectContaining({
          $set: expect.objectContaining({ status: "SUCCEEDED" }),
        }),
      })
    );
    expect(platformJobState.audits).not.toContainEqual(
      expect.objectContaining({ action: "ORGANIZATION_PURGE_SUCCEEDED" })
    );
  });

  it("uses one transaction for the success tombstone, job state, and audit", async () => {
    platformJobState.job = purgeJob(1, 5);
    platformJobState.organizationExists = false;

    await expect(drainPlatformJobs("worker-a")).resolves.toBe(1);

    const successAuditIndex = platformJobState.audits.findIndex(
      (entry) => entry.action === "ORGANIZATION_PURGE_SUCCEEDED"
    );
    const successUpdateIndex = platformJobState.jobUpdates.findIndex(
      ({ update }) => update.$set?.status === "SUCCEEDED"
    );
    expect(platformJobState.tombstoneSessions).toEqual([
      { type: "cascade-session" },
    ]);
    expect(platformJobState.jobUpdateSessions[successUpdateIndex]).toBe(
      platformJobState.tombstoneSessions[0]
    );
    expect(platformJobState.auditSessions[successAuditIndex]).toBe(
      platformJobState.tombstoneSessions[0]
    );
  });
});
