import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fenceState = vi.hoisted(() => ({
  organizationStatus: "ACTIVE",
  monitorCheckWrites: 0,
  notificationLogWrites: 0,
  monitorUpdates: [] as Array<Record<string, unknown>>,
  notificationUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db", () => ({
  mongoClient: {
    startSession: () => ({
      withTransaction: async (callback: () => Promise<void>) => callback(),
      endSession: async () => undefined,
    }),
  },
  collections: {
    pages: () => ({
      findOne: async () => ({ _id: new ObjectId(), orgId: new ObjectId() }),
    }),
    organizations: () => ({
      findOne: async () => ({ status: fenceState.organizationStatus }),
    }),
    monitors: () => ({
      updateOne: async (
        _filter: unknown,
        update: Record<string, unknown>
      ) => {
        fenceState.monitorUpdates.push(update);
        return { matchedCount: 1 };
      },
    }),
    monitorChecks: () => ({
      insertOne: async () => {
        fenceState.monitorCheckWrites += 1;
      },
    }),
    metricPoints: () => ({ insertOne: async () => undefined }),
    notificationJobs: () => ({
      updateOne: async (
        _filter: unknown,
        update: Record<string, unknown>
      ) => {
        fenceState.notificationUpdates.push(update);
        return { matchedCount: 1 };
      },
    }),
    notificationLogs: () => ({
      insertOne: async () => {
        fenceState.notificationLogWrites += 1;
      },
    }),
    notificationDestinations: () => ({ findOne: async () => null }),
    webhookEndpoints: () => ({ findOne: async () => null }),
  },
}));

vi.mock("@/worker/checks", () => ({
  runCheck: async () => {
    fenceState.organizationStatus = "DELETING";
    return {
      ok: true,
      latencyMs: 10,
      statusCode: 200,
      error: null,
    };
  },
}));

vi.mock("@/lib/domain/incidents", () => ({
  createIncident: async () => ({ id: new ObjectId().toHexString() }),
  addIncidentUpdate: async () => undefined,
}));

vi.mock("@/lib/notify", () => ({
  dispatchNotifications: async () => undefined,
}));

vi.mock("@/lib/component-status", () => ({
  reconcileComponentStatus: async () => undefined,
}));

vi.mock("@/lib/organization-state", () => ({
  organizationIsActive: (organization: { status?: string }) =>
    organization.status === "ACTIVE",
}));

vi.mock("@/worker/lease-heartbeat", () => ({
  startLeaseHeartbeat: () => ({
    stop: async () => undefined,
  }),
}));

vi.mock("@/lib/smtp", () => ({
  smtpTransport: () => ({
    sendMail: async () => {
      fenceState.organizationStatus = "DELETING";
      return { accepted: ["operator@example.com"] };
    },
  }),
  verifySmtp: async () => ({ configured: true, ok: true }),
}));

vi.mock("@/lib/encryption", () => ({
  decryptSecret: () => "secret",
}));

vi.mock("@/lib/notification-providers", () => ({
  deliverDestination: async () => null,
  deliverSms: async () => null,
}));

import { processMonitor } from "../worker/monitors";
import { processNotificationJob } from "../worker/notifications";

describe("worker lifecycle write fences", () => {
  beforeEach(() => {
    fenceState.organizationStatus = "ACTIVE";
    fenceState.monitorCheckWrites = 0;
    fenceState.notificationLogWrites = 0;
    fenceState.monitorUpdates.length = 0;
    fenceState.notificationUpdates.length = 0;
  });

  it("drops a monitor result when the tenant becomes inactive during network I/O", async () => {
    const now = new Date();
    await processMonitor(
      {
        _id: new ObjectId(),
        pageId: new ObjectId(),
        componentId: null,
        name: "API",
        type: "HTTP",
        enabled: true,
        target: "https://example.com",
        port: null,
        method: "GET",
        requestBody: null,
        requestHeaders: "{}",
        expectedStatusRange: "200-299",
        keywordMatch: null,
        keywordAbsent: null,
        sslWarnDays: null,
        authType: "NONE",
        authUsername: null,
        authSecret: null,
        authHeaderName: null,
        verifyTls: true,
        intervalSec: 60,
        timeoutMs: 1_000,
        failThreshold: 1,
        recoverThreshold: 1,
        downStatus: "MAJOR_OUTAGE",
        actionFlipStatus: false,
        actionRecordMetric: false,
        actionAutoIncident: false,
        actionNotify: false,
        metricId: null,
        lastCheckedAt: null,
        lastLatencyMs: null,
        lastOk: null,
        lastError: null,
        consecutiveFails: 0,
        consecutiveOks: 0,
        isDown: false,
        currentIncidentId: null,
        leaseOwner: "worker-a",
        leaseExpiresAt: new Date(now.getTime() + 30_000),
        runRequestedAt: now,
        createdAt: now,
      },
      "worker-a"
    );

    expect(fenceState.monitorCheckWrites).toBe(0);
    expect(fenceState.monitorUpdates).toContainEqual({
      $set: { leaseOwner: null, leaseExpiresAt: null },
    });
  });

  it("does not log a delivery after the tenant becomes inactive during delivery", async () => {
    const now = new Date();
    await processNotificationJob(
      {
        _id: new ObjectId(),
        pageId: new ObjectId(),
        subscriberId: null,
        endpointId: null,
        destinationId: null,
        channel: "EMAIL",
        contact: "operator@example.com",
        subject: "Incident",
        body: "Investigating",
        eventType: "incident.created",
        payload: {},
        deduplicationKey: "delivery-key",
        status: "PROCESSING",
        attempts: 0,
        maxAttempts: 8,
        nextAttemptAt: now,
        leaseOwner: "worker-a",
        leaseExpiresAt: new Date(now.getTime() + 30_000),
        responseStatus: null,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        sentAt: null,
      },
      "worker-a"
    );

    expect(fenceState.notificationLogWrites).toBe(0);
    expect(fenceState.notificationUpdates).toContainEqual({
      $set: expect.objectContaining({
        status: "BLOCKED",
        leaseOwner: null,
        leaseExpiresAt: null,
      }),
    });
  });
});
