import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  updateOrganization: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  collections: {
    organizations: () => ({
      updateOne: database.updateOrganization,
    }),
  },
}));

vi.mock("@/lib/mongo-utils", async () => {
  const { ObjectId } = await import("mongodb");
  return {
    oid: (value: string) => new ObjectId(value),
  };
});

import {
  fenceActiveOrganizationMutation,
  OrganizationMutationBlockedError,
} from "../lib/organization-mutation";

describe("organization mutation lifecycle fence", () => {
  beforeEach(() => {
    database.updateOrganization.mockReset();
    database.updateOrganization.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });
  });

  it("writes the active organization row in the caller's transaction", async () => {
    const organizationId = new ObjectId("000000000000000000000001");
    const session = { id: "tenant-write-transaction" };

    await fenceActiveOrganizationMutation(organizationId, session as never);

    expect(database.updateOrganization).toHaveBeenCalledWith(
      {
        _id: organizationId,
        $or: [
          { status: "ACTIVE" },
          {
            status: { $exists: false },
            suspended: { $ne: true },
          },
        ],
      },
      { $inc: { mutationRevision: 1 } },
      { session }
    );
  });

  it("aborts when suspension or purge made the organization inactive", async () => {
    database.updateOrganization.mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
    });

    await expect(
      fenceActiveOrganizationMutation(
        "000000000000000000000001",
        { id: "retried-after-lifecycle-change" } as never
      )
    ).rejects.toBeInstanceOf(OrganizationMutationBlockedError);
  });
});
