import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionState = vi.hoisted(() => ({
  activeOperation: null as string | null,
  calls: [] as string[],
  storageDrivers: [] as string[],
}));

vi.mock("@/lib/db", () => {
  async function runSessionOperation(name: string) {
    if (transactionState.activeOperation) {
      throw new Error(
        `Concurrent session operation: ${name} overlapped ${transactionState.activeOperation}`
      );
    }
    transactionState.activeOperation = name;
    await Promise.resolve();
    transactionState.calls.push(name);
    transactionState.activeOperation = null;
    return { acknowledged: true };
  }

  function makeCollection(name: string) {
    return {
      find: (_filter?: unknown, options?: { session?: unknown }) => ({
        toArray: async () => {
          if (options?.session) await runSessionOperation(`${name}.find`);
          return name === "assets"
            ? [
                { storageKey: "local-object", storageDriver: "LOCAL" },
                { storageKey: "s3-object", storageDriver: "S3" },
              ]
            : [];
        },
      }),
      findOne: async (_filter?: unknown, options?: { session?: unknown }) => {
        if (options?.session) await runSessionOperation(`${name}.findOne`);
        const id = {
          toHexString: () => "000000000000000000000001",
        };
        if (name === "pages") return { _id: id, orgId: id };
        if (name === "components") return { _id: id, pageId: id };
        if (name === "metrics") return { _id: id, pageId: id };
        if (name === "monitors") {
          return { _id: id, pageId: id, metricId: null };
        }
        return null;
      },
      deleteMany: () => runSessionOperation(`${name}.deleteMany`),
      deleteOne: async () => {
        await runSessionOperation(`${name}.deleteOne`);
        return { acknowledged: true, deletedCount: 1 };
      },
      updateMany: () => runSessionOperation(`${name}.updateMany`),
      updateOne: async () => {
        await runSessionOperation(`${name}.updateOne`);
        return {
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
        };
      },
    };
  }

  const collectionFactories = new Proxy(
    {} as Record<string, () => ReturnType<typeof makeCollection>>,
    {
      get: (_target, property) => () => makeCollection(String(property)),
    }
  );

  return {
    collections: collectionFactories,
    db: {
      collection: (name: string) => makeCollection(name),
    },
    mongoClient: {
      startSession: () => ({
        withTransaction: async (callback: () => Promise<unknown>) => callback(),
        endSession: async () => undefined,
      }),
    },
  };
});

vi.mock("@/lib/asset-storage", () => ({
  assetStorageForDriver: (driver: string) => {
    transactionState.storageDrivers.push(driver);
    return {
      driver,
      delete: async () => undefined,
    };
  },
}));

vi.mock("@/lib/mongo-utils", () => ({
  oid: (value: string) => ({
    toHexString: () => value,
  }),
}));

import {
  deleteComponentCascade,
  deleteIncidentCascade,
  deleteMetricCascade,
  deleteMonitorCascade,
  deleteOrgCascade,
  deletePageCascade,
} from "../lib/cascade";

describe("cascade transaction serialization", () => {
  beforeEach(() => {
    transactionState.activeOperation = null;
    transactionState.calls.length = 0;
    transactionState.storageDrivers.length = 0;
  });

  it("never overlaps operations that share a MongoDB transaction session", async () => {
    const id = new ObjectId().toHexString();

    await expect(deletePageCascade(id, id)).resolves.toBe(true);
    await expect(deleteIncidentCascade(id)).resolves.toBeUndefined();
    await expect(deleteComponentCascade(id, id, id)).resolves.toBe(true);
    await expect(deleteOrgCascade(id)).resolves.toBeUndefined();
    await expect(deleteMetricCascade(id, id, id)).resolves.toBe(true);
    await expect(deleteMonitorCascade(id, id, id)).resolves.toBe(true);

    expect(transactionState.activeOperation).toBeNull();
    expect(transactionState.calls.length).toBeGreaterThan(50);
    expect(transactionState.calls).toContain("teamMembers.deleteMany");
    expect(transactionState.calls).toContain(
      "organizationInvariantLocks.deleteMany"
    );
    expect(new Set(transactionState.storageDrivers)).toEqual(
      new Set(["LOCAL", "S3"])
    );
  });
});
