import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";

const purgeState = vi.hoisted(() => ({
  organizationId: null as unknown as ObjectId,
  pageId: null as unknown as ObjectId,
  firstMonitorId: null as unknown as ObjectId,
  lateMonitorId: null as unknown as ObjectId,
  monitors: [] as ObjectId[],
  monitorChecks: [] as ObjectId[],
  transactionCount: 0,
  pageDeleted: false,
  organizationDeleted: false,
  monitorCheckFilters: [] as ObjectId[][],
}));

vi.mock("@/lib/db", () => {
  function idsFromFilter(filter: Record<string, unknown>, field: string) {
    const value = filter[field] as { $in?: ObjectId[] } | undefined;
    return value?.$in ?? [];
  }

  function emptyCollection() {
    return {
      find: () => ({ toArray: async () => [] }),
      findOne: async () => null,
      deleteMany: async () => ({ deletedCount: 0 }),
      deleteOne: async () => ({ deletedCount: 0 }),
      updateMany: async () => ({ modifiedCount: 0 }),
    };
  }

  const collections = new Proxy(
    {
      pages: () => ({
        find: () => ({
          toArray: async () =>
            purgeState.pageDeleted ? [] : [{ _id: purgeState.pageId }],
        }),
        deleteMany: async () => {
          if (purgeState.pageDeleted) return { deletedCount: 0 };
          purgeState.pageDeleted = true;
          return { deletedCount: 1 };
        },
      }),
      monitors: () => ({
        find: () => ({
          toArray: async () =>
            purgeState.monitors.map((_id) => ({ _id })),
        }),
        findOne: async () => null,
        deleteMany: async () => {
          const deletedCount = purgeState.monitors.length;
          purgeState.monitors.length = 0;
          return { deletedCount };
        },
      }),
      monitorChecks: () => ({
        deleteMany: async (filter: Record<string, unknown>) => {
          const monitorIds = idsFromFilter(filter, "monitorId");
          purgeState.monitorCheckFilters.push(monitorIds);
          const retained = purgeState.monitorChecks.filter(
            (monitorId) =>
              !monitorIds.some((candidate) => candidate.equals(monitorId))
          );
          const deletedCount =
            purgeState.monitorChecks.length - retained.length;
          purgeState.monitorChecks = retained;
          return { deletedCount };
        },
      }),
      organizations: () => ({
        deleteOne: async () => {
          if (purgeState.organizationDeleted) return { deletedCount: 0 };
          purgeState.organizationDeleted = true;
          return { deletedCount: 1 };
        },
      }),
      notificationJobs: () => ({
        findOne: async () => null,
        deleteMany: async () => ({ deletedCount: 0 }),
      }),
      assets: () => ({
        find: () => ({ toArray: async () => [] }),
        deleteMany: async () => ({ deletedCount: 0 }),
      }),
    } as unknown as Record<string, () => ReturnType<typeof emptyCollection>>,
    {
      get(target, property: string) {
        return target[property] ?? (() => emptyCollection());
      },
    }
  );

  return {
    collections,
    db: {
      collection: () => emptyCollection(),
    },
    mongoClient: {
      startSession: () => ({
        withTransaction: async (callback: () => Promise<void>) => {
          await callback();
          purgeState.transactionCount += 1;
          if (purgeState.transactionCount === 1) {
            // Simulate a request/monitor write that lands after the initial
            // purge snapshot and after its parent monitor was deleted.
            purgeState.monitors.push(purgeState.lateMonitorId);
            purgeState.monitorChecks.push(purgeState.lateMonitorId);
          }
        },
        endSession: async () => undefined,
      }),
    },
  };
});

vi.mock("@/lib/asset-storage", () => ({
  assetStorageForDriver: () => ({
    delete: async () => undefined,
  }),
}));

vi.mock("@/lib/mongo-utils", () => ({
  oid: () => purgeState.organizationId,
}));

import { deleteOrgCascade } from "../lib/cascade";

describe("organization purge fixed-point cleanup", () => {
  it("removes data written after the initial snapshot and retains its parent scope", async () => {
    purgeState.organizationId = new ObjectId();
    purgeState.pageId = new ObjectId();
    purgeState.firstMonitorId = new ObjectId();
    purgeState.lateMonitorId = new ObjectId();
    purgeState.monitors = [purgeState.firstMonitorId];
    purgeState.monitorChecks = [purgeState.firstMonitorId];
    purgeState.transactionCount = 0;
    purgeState.pageDeleted = false;
    purgeState.organizationDeleted = false;
    purgeState.monitorCheckFilters.length = 0;

    await deleteOrgCascade(purgeState.organizationId.toHexString(), {
      settleDelayMs: 0,
    });

    expect(purgeState.monitors).toEqual([]);
    expect(purgeState.monitorChecks).toEqual([]);
    expect(purgeState.pageDeleted).toBe(true);
    expect(purgeState.organizationDeleted).toBe(true);
    expect(
      purgeState.monitorCheckFilters.some(
        (ids) =>
          ids.some((id) => id.equals(purgeState.firstMonitorId)) &&
          ids.some((id) => id.equals(purgeState.lateMonitorId))
      )
    ).toBe(true);
  });
});
