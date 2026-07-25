import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformAdminDoc } from "../lib/db";

const database = vi.hoisted(() => ({
  platformAdminFindOne: vi.fn(),
  platformAdminUpdateOne: vi.fn(),
  platformAdminCountDocuments: vi.fn(),
  supportSessionUpdateMany: vi.fn(),
  platformAuditInsertOne: vi.fn(),
}));

const external = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requirePlatformCapability: vi.fn(),
  requirePlatformStepUp: vi.fn(),
  writePlatformAudit: vi.fn(),
  withInvariantTransaction: vi.fn(),
}));

const transactionSession = { transaction: "platform-admin-test" };

vi.mock("next/cache", () => ({
  revalidatePath: external.revalidatePath,
}));

vi.mock("@/lib/admin-guard", () => ({
  requirePlatformCapability: external.requirePlatformCapability,
}));

vi.mock("@/lib/db", () => ({
  collections: {
    platformAdmins: () => ({
      findOne: database.platformAdminFindOne,
      updateOne: database.platformAdminUpdateOne,
      countDocuments: database.platformAdminCountDocuments,
    }),
    supportSessions: () => ({
      updateMany: database.supportSessionUpdateMany,
    }),
    platformAuditLogs: () => ({
      insertOne: database.platformAuditInsertOne,
    }),
    platformInvites: () => ({
      findOne: vi.fn(),
      updateOne: vi.fn(),
      updateMany: vi.fn(),
      insertOne: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/identity", () => ({
  canonicalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

vi.mock("@/lib/mongo-utils", async () => {
  const { ObjectId: MongoObjectId } = await import("mongodb");
  return {
    oid: (value: string) => new MongoObjectId(value),
  };
});

vi.mock("@/lib/platform-admin-safety", () => {
  const isActiveOwner = (admin: {
    role?: string;
    status?: string;
  }) =>
    (admin.role ?? "OWNER") === "OWNER" &&
    (admin.status ?? "ACTIVE") === "ACTIVE";
  return {
    platformSessionVersionTransition: (admin: {
      sessionVersion?: number;
    }) => {
      const current = admin.sessionVersion ?? 1;
      return {
        current,
        next: current + 1,
        filter:
          admin.sessionVersion === undefined
            ? { sessionVersion: { $exists: false } }
            : { sessionVersion: current },
      };
    },
    requirePlatformStepUp: external.requirePlatformStepUp,
    transitionRemovesActivePlatformOwner: (
      current: { role?: string; status?: string },
      next: { role?: string; status?: string }
    ) => isActiveOwner(current) && !isActiveOwner(next),
    withPlatformAdminInvariantTransaction:
      external.withInvariantTransaction,
  };
});

vi.mock("@/lib/platform-policy", () => ({
  hasPlatformCapability: (role: string, capability: string) =>
    role === "OWNER" && capability === "admins.manage",
  normalizedPlatformRole: (admin: { role?: string }) =>
    admin.role ?? "OWNER",
  platformAdminIsActive: (admin: { status?: string }) =>
    (admin.status ?? "ACTIVE") === "ACTIVE",
  writePlatformAudit: external.writePlatformAudit,
}));

vi.mock("@/lib/secrets", () => ({
  generateSecret: () => ({ token: "invite-token", hash: "invite-hash" }),
}));

vi.mock("@/lib/url", () => ({
  publicAppUrl: () => "https://status.example.test",
}));

import {
  resetPlatformAdminMfa,
  setPlatformAdminStatus,
  updatePlatformAdminRole,
} from "../app/platform/(protected)/admins/actions";

const actorId = new ObjectId("000000000000000000000011");
const targetId = new ObjectId("000000000000000000000012");

function platformAdmin(
  id: ObjectId,
  overrides: Partial<PlatformAdminDoc> = {}
): PlatformAdminDoc {
  return {
    _id: id,
    email:
      id.toHexString() === actorId.toHexString()
        ? "owner@example.test"
        : "target@example.test",
    canonicalEmail:
      id.toHexString() === actorId.toHexString()
        ? "owner@example.test"
        : "target@example.test",
    passwordHash: "password-hash",
    name: "Platform administrator",
    role: "OWNER",
    status: "ACTIVE",
    sessionVersion: id.equals(actorId) ? 4 : 1,
    totpSecretCiphertext: "encrypted-totp",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function changeForm() {
  const formData = new FormData();
  formData.set("reason", "Approved platform security change");
  return formData;
}

describe("platform administrator mutation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    external.requirePlatformCapability.mockResolvedValue({
      platformAdminId: actorId.toHexString(),
      email: "owner@example.test",
      name: "Owner",
      role: "OWNER",
      sessionVersion: 4,
    });
    external.requirePlatformStepUp.mockResolvedValue(undefined);
    external.withInvariantTransaction.mockImplementation(
      async (
        callback: (session: typeof transactionSession) => Promise<unknown>
      ) => callback(transactionSession)
    );
    database.platformAdminUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });
    database.platformAdminCountDocuments.mockResolvedValue(2);
    database.supportSessionUpdateMany.mockResolvedValue({
      acknowledged: true,
      modifiedCount: 0,
    });
    database.platformAuditInsertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    });
  });

  it("re-reads the actor in the transaction and rejects a stale manager grant", async () => {
    database.platformAdminFindOne.mockResolvedValueOnce(
      platformAdmin(actorId, { role: "OPERATOR" })
    );
    const formData = changeForm();
    formData.set("role", "AUDITOR");

    await expect(
      updatePlatformAdminRole(targetId.toHexString(), formData)
    ).rejects.toThrow(
      "Platform administrator authorization changed; reload and retry"
    );

    expect(database.platformAdminFindOne).toHaveBeenCalledWith(
      {
        _id: actorId,
        status: { $ne: "DISABLED" },
      },
      { session: transactionSession }
    );
    expect(database.platformAdminUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects a request whose actor session was revoked before the transaction", async () => {
    database.platformAdminFindOne.mockResolvedValueOnce(
      platformAdmin(actorId, { sessionVersion: 5 })
    );
    const formData = changeForm();
    formData.set("role", "AUDITOR");

    await expect(
      updatePlatformAdminRole(targetId.toHexString(), formData)
    ).rejects.toThrow(
      "Platform administrator authorization changed; sign in again"
    );

    expect(database.platformAdminFindOne).toHaveBeenCalledTimes(1);
    expect(database.platformAdminUpdateOne).not.toHaveBeenCalled();
  });

  it("does not report a successful role change when the requested role is unchanged", async () => {
    database.platformAdminFindOne
      .mockResolvedValueOnce(platformAdmin(actorId))
      .mockResolvedValueOnce(platformAdmin(targetId, { role: "OPERATOR" }));
    const formData = changeForm();
    formData.set("role", "OPERATOR");

    await expect(
      updatePlatformAdminRole(targetId.toHexString(), formData)
    ).rejects.toThrow("Choose a different platform administrator role");

    expect(database.platformAdminUpdateOne).not.toHaveBeenCalled();
    expect(database.platformAuditInsertOne).not.toHaveBeenCalled();
  });

  it("does not report a successful status change when the requested status is unchanged", async () => {
    database.platformAdminFindOne
      .mockResolvedValueOnce(platformAdmin(actorId))
      .mockResolvedValueOnce(platformAdmin(targetId, { status: "ACTIVE" }));

    await expect(
      setPlatformAdminStatus(
        targetId.toHexString(),
        "ACTIVE",
        changeForm()
      )
    ).rejects.toThrow(
      "Platform administrator is already active; reload and retry"
    );

    expect(database.platformAdminUpdateOne).not.toHaveBeenCalled();
    expect(database.platformAuditInsertOne).not.toHaveBeenCalled();
  });

  it("revokes legacy sessions on a role change with an absent-version CAS", async () => {
    database.platformAdminFindOne
      .mockResolvedValueOnce(platformAdmin(actorId, { sessionVersion: 4 }))
      .mockResolvedValueOnce(platformAdmin(targetId, { sessionVersion: undefined }));
    const formData = changeForm();
    formData.set("role", "AUDITOR");

    await updatePlatformAdminRole(targetId.toHexString(), formData);

    expect(database.platformAdminUpdateOne).toHaveBeenCalledWith(
      {
        _id: targetId,
        sessionVersion: { $exists: false },
      },
      {
        $set: {
          role: "AUDITOR",
          sessionVersion: 2,
          updatedAt: expect.any(Date),
        },
      },
      { session: transactionSession }
    );
  });

  it("revokes legacy sessions on a status change with an absent-version CAS", async () => {
    database.platformAdminFindOne
      .mockResolvedValueOnce(platformAdmin(actorId, { sessionVersion: 4 }))
      .mockResolvedValueOnce(platformAdmin(targetId, { sessionVersion: undefined }));

    await setPlatformAdminStatus(
      targetId.toHexString(),
      "DISABLED",
      changeForm()
    );

    expect(database.platformAdminUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: targetId,
        sessionVersion: { $exists: false },
      }),
      {
        $set: expect.objectContaining({
          status: "DISABLED",
          sessionVersion: 2,
        }),
      },
      { session: transactionSession }
    );
  });

  it("revokes legacy sessions on an MFA reset with an absent-version CAS", async () => {
    database.platformAdminFindOne
      .mockResolvedValueOnce(platformAdmin(actorId, { sessionVersion: 4 }))
      .mockResolvedValueOnce(platformAdmin(targetId, { sessionVersion: undefined }));

    await resetPlatformAdminMfa(targetId.toHexString(), changeForm());

    expect(external.requirePlatformStepUp).toHaveBeenCalledWith(
      actorId.toHexString(),
      expect.any(FormData),
      "platform administrator MFA reset"
    );
    expect(database.platformAdminUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: targetId,
        sessionVersion: { $exists: false },
      }),
      {
        $set: expect.objectContaining({
          totpSecretCiphertext: null,
          sessionVersion: 2,
        }),
      },
      { session: transactionSession }
    );
  });

  it("uses the pre-change actor for a safe self-demotion and preserves the last Owner", async () => {
    external.requirePlatformCapability.mockResolvedValueOnce({
      platformAdminId: actorId.toHexString(),
      email: "owner@example.test",
      name: "Owner",
      role: "OWNER",
      sessionVersion: 9,
    });
    database.platformAdminFindOne.mockResolvedValueOnce(
      platformAdmin(actorId, { sessionVersion: 9 })
    );
    database.platformAdminCountDocuments.mockResolvedValueOnce(2);
    const formData = changeForm();
    formData.set("role", "OPERATOR");

    await updatePlatformAdminRole(actorId.toHexString(), formData);

    expect(database.platformAdminFindOne).toHaveBeenCalledTimes(1);
    expect(database.platformAdminUpdateOne).toHaveBeenCalledWith(
      { _id: actorId, sessionVersion: 9 },
      {
        $set: {
          role: "OPERATOR",
          sessionVersion: 10,
          updatedAt: expect.any(Date),
        },
      },
      { session: transactionSession }
    );
    expect(database.platformAuditInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId,
        actorRole: "OWNER",
        action: "PLATFORM_ADMIN_ROLE_CHANGED",
      }),
      { session: transactionSession }
    );
  });

  it("blocks a self-demotion when the actor is the last active Owner", async () => {
    database.platformAdminFindOne.mockResolvedValueOnce(platformAdmin(actorId));
    database.platformAdminCountDocuments.mockResolvedValueOnce(1);
    const formData = changeForm();
    formData.set("role", "OPERATOR");

    await expect(
      updatePlatformAdminRole(actorId.toHexString(), formData)
    ).rejects.toThrow("The last active platform Owner cannot be demoted");

    expect(database.platformAdminFindOne).toHaveBeenCalledTimes(1);
    expect(database.platformAdminUpdateOne).not.toHaveBeenCalled();
  });
});
