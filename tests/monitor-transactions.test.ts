import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import type { MonitorInput, PreparedMonitorInput } from "../lib/domain/monitors";

const transactionState = vi.hoisted(() => ({
  calls: [] as Array<{ operation: string; session: unknown }>,
  startSession: vi.fn(),
}));

vi.mock("@/lib/db", async () => {
  const { ObjectId } = await import("mongodb");
  const pageId = new ObjectId("000000000000000000000002");

  function record(operation: string, options?: { session?: unknown }) {
    transactionState.calls.push({
      operation,
      session: options?.session,
    });
  }

  return {
    collections: {
      pages: () => ({
        findOne: async (_filter: unknown, options?: { session?: unknown }) => {
          record("pages.findOne", options);
          return { _id: pageId };
        },
      }),
      components: () => ({
        findOne: async (_filter: unknown, options?: { session?: unknown }) => {
          record("components.findOne", options);
          return { _id: new ObjectId("000000000000000000000003"), pageId };
        },
      }),
      metrics: () => ({
        insertOne: async (_document: unknown, options?: { session?: unknown }) => {
          record("metrics.insertOne", options);
        },
      }),
      monitors: () => ({
        insertOne: async (_document: unknown, options?: { session?: unknown }) => {
          record("monitors.insertOne", options);
        },
      }),
      organizations: () => ({
        updateOne: async (
          _filter: unknown,
          _update: unknown,
          options?: { session?: unknown }
        ) => {
          record("organizations.updateOne", options);
          return { matchedCount: 1, modifiedCount: 1 };
        },
      }),
    },
    mongoClient: {
      startSession: transactionState.startSession,
    },
  };
});

vi.mock("@/lib/mongo-utils", async () => {
  const { ObjectId } = await import("mongodb");
  return {
    oid: (value: string) => new ObjectId(value),
    toId: (document: { _id: ObjectId }) => ({
      ...document,
      id: document._id.toHexString(),
    }),
  };
});

vi.mock("@/lib/encryption", () => ({
  encryptSecret: (value: string) => `encrypted:${value}`,
}));

vi.mock("@/lib/tokens", () => ({
  generateAutomationToken: () => ({
    hash: "token-hash",
    prefix: "token",
    lastFour: "last",
  }),
}));

vi.mock("@/lib/monitor-validation", () => ({
  MONITOR_TYPES: [
    "HTTP",
    "KEYWORD",
    "TCP",
    "TLS",
    "ICMP",
    "DNS",
    "HEARTBEAT",
  ],
  normalizeMonitorConfiguration: (value: unknown) => value,
}));

vi.mock("@/lib/monitor-target-validation", () => ({
  validateMonitorTarget: async () => undefined,
}));

vi.mock("@/lib/organization-mutation", () => ({
  fenceActiveOrganizationMutation: async (
    _organizationId: unknown,
    session: unknown
  ) => {
    transactionState.calls.push({
      operation: "organizations.updateOne",
      session,
    });
  },
}));

import { createPreparedMonitor } from "../lib/domain/monitors";

function preparedInput(): PreparedMonitorInput {
  const input: MonitorInput = {
    name: "Template availability",
    type: "HTTP",
    componentId: "000000000000000000000003",
    target: "https://status.example.test",
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
    timeoutMs: 10_000,
    failThreshold: 3,
    recoverThreshold: 2,
    downStatus: "MAJOR_OUTAGE",
    actionFlipStatus: true,
    actionRecordMetric: true,
    actionAutoIncident: true,
    actionNotify: true,
  };
  return input as PreparedMonitorInput;
}

describe("monitor transaction composition", () => {
  it("uses the caller's session for every read and write without nesting a transaction", async () => {
    transactionState.calls.length = 0;
    transactionState.startSession.mockClear();
    const callerSession = { id: "component-creation-transaction" };

    await createPreparedMonitor(
      "000000000000000000000001",
      "000000000000000000000002",
      preparedInput(),
      callerSession as never
    );

    expect(transactionState.startSession).not.toHaveBeenCalled();
    expect(transactionState.calls.map(({ operation }) => operation)).toEqual([
      "organizations.updateOne",
      "pages.findOne",
      "components.findOne",
      "metrics.insertOne",
      "monitors.insertOne",
    ]);
    expect(
      transactionState.calls.every(({ session }) => session === callerSession)
    ).toBe(true);
  });
});
