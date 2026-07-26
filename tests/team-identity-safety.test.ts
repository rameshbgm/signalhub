import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipDoc, UserDoc } from "../lib/db";

const database = vi.hoisted(() => {
  return {
    membershipFindOne: vi.fn(),
    membershipFind: vi.fn(),
    membershipCountDocuments: vi.fn(),
    adminMembershipToArray: vi.fn(),
    membershipInsertOne: vi.fn(),
    membershipUpdateOne: vi.fn(),
    userFindOne: vi.fn(),
    userCountDocuments: vi.fn(),
    userInsertOne: vi.fn(),
    auditInsertOne: vi.fn(),
    authSessionUpdateMany: vi.fn(),
    withTransaction: vi.fn(),
    endSession: vi.fn(),
  };
});

const external = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  transitionRemovesActiveAdmin: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: external.revalidatePath,
}));

vi.mock("@/lib/secrets", () => ({
  generateSecret: vi.fn(() => ({
    token: "org_invite_test-token",
    hash: "new-token-hash",
    prefix: "org_invite_test",
    lastFour: "oken",
  })),
}));

vi.mock("@/lib/url", () => ({
  publicAppUrl: vi.fn(() => "https://status.example.test"),
}));

vi.mock("@/lib/admin-guard", () => ({
  assertPageInOrg: vi.fn(),
  requireCapability: vi.fn(async () => ({
    orgId: "000000000000000000000001",
    membershipId: "000000000000000000000099",
    userId: "000000000000000000000098",
    email: "admin@example.test",
    role: "ADMIN",
    supportSessionId: null,
  })),
}));

vi.mock("@/lib/identity", () => ({
  canonicalizeEmail: (email: string) => email.trim().toLowerCase(),
  MEMBERSHIP_ROLES: ["ADMIN", "INCIDENT_MANAGER", "RESPONDER", "VIEWER"],
}));

vi.mock("@/lib/mongo-utils", async () => {
  const { ObjectId: MongoObjectId } = await import("mongodb");
  return {
    oid: (value: string) => new MongoObjectId(value),
  };
});

vi.mock("@/lib/team-owner-safety", () => ({
  transitionRemovesActiveAdmin: external.transitionRemovesActiveAdmin,
  withOrganizationAdminInvariantTransaction: vi.fn(
    async (
      _organizationId: string,
      work: (session: Record<string, never>) => Promise<unknown>
    ) => {
      const transactionSession = {};
      try {
        let result: unknown;
        await database.withTransaction(async () => {
          result = await work(transactionSession);
        });
        return result;
      } finally {
        await database.endSession();
      }
    }
  ),
}));

vi.mock("@/lib/db", () => ({
  collections: {
    memberships: () => ({
      findOne: database.membershipFindOne,
      find: database.membershipFind,
      countDocuments: database.membershipCountDocuments,
      insertOne: database.membershipInsertOne,
      updateOne: database.membershipUpdateOne,
    }),
    users: () => ({
      findOne: database.userFindOne,
      insertOne: database.userInsertOne,
      countDocuments: database.userCountDocuments,
    }),
    auditLogs: () => ({
      insertOne: database.auditInsertOne,
    }),
    authSessions: () => ({
      updateMany: database.authSessionUpdateMany,
    }),
  },
}));

import {
  inviteMember,
  reactivateMember,
  regenerateMemberInvite,
  removeMember,
} from "../app/admin/(protected)/team/actions";

const orgId = new ObjectId("000000000000000000000001");
const membershipId = new ObjectId("000000000000000000000002");
const userId = new ObjectId("000000000000000000000003");
const actorMembershipId = new ObjectId("000000000000000000000099");
const actorUserId = new ObjectId("000000000000000000000098");

function membership(status: MembershipDoc["status"]): MembershipDoc {
  return {
    _id: membershipId,
    orgId,
    userId,
    role: "RESPONDER",
    status,
    pageIds: null,
    invitationExpiresAt: null,
    invitationTokenHash: null,
    activatedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function user(overrides: Partial<UserDoc> = {}): UserDoc {
  return {
    _id: userId,
    email: "member@example.test",
    canonicalEmail: "member@example.test",
    passwordHash: "old-hash",
    name: "Member",
    twoFactorEnabled: false,
    disabled: false,
    mustChangePassword: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
    username: overrides.username ?? "member",
    canonicalUsername: overrides.canonicalUsername ?? overrides.username ?? "member",
  };
}

function actorMembership(): MembershipDoc {
  return {
    ...membership("ACTIVE"),
    _id: actorMembershipId,
    userId: actorUserId,
    role: "ADMIN",
  };
}

describe("tenant identity-safe membership recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.withTransaction.mockImplementation(
      async (callback: () => Promise<unknown>) => callback()
    );
    external.transitionRemovesActiveAdmin.mockReturnValue(false);
    database.membershipFind.mockReturnValue({
      toArray: database.adminMembershipToArray,
    });
    database.adminMembershipToArray.mockResolvedValue([]);
    database.membershipCountDocuments.mockResolvedValue(1);
    database.userCountDocuments.mockResolvedValue(0);
    database.membershipUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });
    database.auditInsertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    });
    database.membershipInsertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    });
    database.userInsertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    });
  });

  it("keeps an existing password-backed identity pending behind a 48-hour token", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(null);
    database.userFindOne.mockResolvedValue(user());
    const formData = new FormData();
    formData.set("name", "Member");
    formData.set("email", "member@example.test");
    formData.set("role", "RESPONDER");

    const startedAt = Date.now();
    const result = await inviteMember({ ok: false }, formData);

    expect(result).toEqual({
      ok: true,
      inviteUrl: "https://status.example.test/invite/org_invite_test-token",
      inviteeName: "Member",
    });
    expect(database.membershipInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        userId,
        role: "RESPONDER",
        status: "INVITED",
        invitationTokenHash: "new-token-hash",
        activatedAt: null,
      }),
      expect.objectContaining({ session: expect.anything() })
    );
    const insertedMembership = database.membershipInsertOne.mock.calls[0]?.[0] as {
      invitationExpiresAt: Date;
    };
    expect(insertedMembership.invitationExpiresAt.getTime()).toBeGreaterThanOrEqual(
      startedAt + 48 * 60 * 60_000
    );
    expect(insertedMembership.invitationExpiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 48 * 60 * 60_000
    );
    expect(database.auditInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "INVITE_MEMBER",
        target: "member@example.test",
        metadata: expect.objectContaining({
          existingIdentity: true,
          invitationExpiresAt: insertedMembership.invitationExpiresAt,
        }),
      }),
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it("creates a new invited identity without a password until acceptance", async () => {
    database.membershipFindOne.mockResolvedValueOnce(actorMembership());
    database.userFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user({ passwordHash: null, mustChangePassword: false }));
    const formData = new FormData();
    formData.set("name", "Member");
    formData.set("email", "member@example.test");
    formData.set("role", "VIEWER");

    const result = await inviteMember({ ok: false }, formData);

    expect(result.ok).toBe(true);
    expect(database.userInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "member@example.test",
        canonicalEmail: "member@example.test",
        passwordHash: null,
        mustChangePassword: false,
      }),
      expect.objectContaining({ session: expect.anything() })
    );
    expect(database.membershipInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "INVITED",
        invitationTokenHash: "new-token-hash",
      }),
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it("does not let a tenant invite set a password on an existing passwordless identity", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(null);
    database.userFindOne.mockResolvedValue(
      user({
        passwordHash: null,
        oidcIssuer: "https://identity.example.test",
        oidcSubject: "member-1",
      })
    );
    const formData = new FormData();
    formData.set("name", "Member");
    formData.set("email", "member@example.test");
    formData.set("role", "RESPONDER");

    const result = await inviteMember({ ok: false }, formData);

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining(
        "existing identity does not have a password"
      ),
    });
    expect(database.membershipInsertOne).not.toHaveBeenCalled();
    expect(database.userInsertOne).not.toHaveBeenCalled();
    expect(database.auditInsertOne).not.toHaveBeenCalled();
  });

  it("rotates a pending invitation token without changing the global password", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(membership("INVITED"));
    database.userFindOne.mockResolvedValue(user());

    const result = await regenerateMemberInvite(
      membershipId.toHexString(),
      { ok: false },
      new FormData()
    );
    const transactionSession = (
      database.membershipFindOne.mock.calls[1]?.[1] as { session: unknown }
    ).session;

    expect(result).toEqual({
      ok: true,
      inviteUrl: "https://status.example.test/invite/org_invite_test-token",
      inviteeName: "Member",
    });

    expect(database.membershipFindOne).toHaveBeenNthCalledWith(
      2,
      { _id: membershipId, orgId },
      { session: transactionSession }
    );
    expect(database.membershipUpdateOne).toHaveBeenCalledWith(
      {
        _id: membershipId,
        orgId,
        userId,
        status: "INVITED",
      },
      {
        $set: {
          invitationTokenHash: "new-token-hash",
          invitationExpiresAt: expect.any(Date),
          activatedAt: null,
        },
      },
      { session: transactionSession }
    );
    expect(database.auditInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        actor: "admin@example.test",
        action: "REISSUE_MEMBER_INVITATION",
        target: "member@example.test",
        metadata: expect.objectContaining({
          membershipId: membershipId.toHexString(),
          invitationExpiresAt: expect.any(Date),
        }),
      }),
      { session: transactionSession }
    );
    expect(database.withTransaction).toHaveBeenCalledOnce();
    expect(database.endSession).toHaveBeenCalledOnce();
    expect(external.revalidatePath).toHaveBeenCalledWith("/organization/team");
  });

  it("does not turn an active membership back into a pending invitation", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(membership("ACTIVE"));

    const result = await regenerateMemberInvite(
      membershipId.toHexString(),
      { ok: false },
      new FormData()
    );

    expect(result).toEqual({
      ok: false,
      error: "Only a pending invitation can receive a new link",
    });
    expect(database.userFindOne).not.toHaveBeenCalled();
    expect(database.membershipUpdateOne).not.toHaveBeenCalled();
    expect(database.auditInsertOne).not.toHaveBeenCalled();
  });

  it("does not rely on disabled identities when protecting the last active Admin", async () => {
    const target = { ...membership("ACTIVE"), role: "ADMIN" as const };
    const disabledAdminUserId = new ObjectId("000000000000000000000004");
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(target);
    database.userFindOne.mockResolvedValue(user());
    external.transitionRemovesActiveAdmin.mockReturnValue(true);
    database.adminMembershipToArray.mockResolvedValue([
      target,
      { ...target, userId: disabledAdminUserId },
    ]);
    database.userCountDocuments.mockResolvedValue(1);

    await expect(removeMember(membershipId.toHexString())).rejects.toThrow(
      "The last Admin cannot be removed"
    );

    expect(database.userCountDocuments).toHaveBeenCalledWith(
      {
        _id: { $in: [userId, disabledAdminUserId] },
        disabled: { $ne: true },
      },
      expect.objectContaining({ session: expect.anything() })
    );
    expect(database.membershipUpdateOne).not.toHaveBeenCalled();
  });

  it("allows cleanup of an already-disabled Admin membership", async () => {
    const target = { ...membership("ACTIVE"), role: "ADMIN" as const };
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(target);
    database.userFindOne.mockResolvedValue(user({ disabled: true }));
    external.transitionRemovesActiveAdmin.mockReturnValue(true);

    await removeMember(membershipId.toHexString());

    expect(database.userCountDocuments).not.toHaveBeenCalled();
    expect(database.membershipUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: membershipId,
        status: { $ne: "REVOKED" },
      }),
      { $set: { status: "REVOKED" } },
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it("directly reactivates a credentialed revoked member and audits it", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(membership("REVOKED"));
    database.userFindOne.mockResolvedValue(user());

    const result = await reactivateMember(
      membershipId.toHexString(),
      { ok: false },
      new FormData()
    );
    const transactionSession = (
      database.membershipFindOne.mock.calls[1]?.[1] as { session: unknown }
    ).session;

    expect(result).toEqual({
      ok: true,
      inviteeName: "Member",
      reactivated: true,
    });
    expect(database.membershipFindOne).toHaveBeenCalledWith(
      { _id: membershipId, orgId },
      { session: transactionSession }
    );
    expect(database.membershipUpdateOne).toHaveBeenCalledWith(
      {
        _id: membershipId,
        orgId,
        userId,
        status: "REVOKED",
      },
      {
        $set: {
          status: "ACTIVE",
          invitationExpiresAt: null,
          invitationTokenHash: null,
          activatedAt: expect.any(Date),
        },
      },
      { session: transactionSession }
    );
    expect(database.auditInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        action: "REACTIVATE_MEMBER",
        target: "member@example.test",
        metadata: {
          membershipId: membershipId.toHexString(),
          activationMode: "DIRECT",
        },
      }),
      { session: transactionSession }
    );
    expect(database.membershipCountDocuments).not.toHaveBeenCalled();
    expect(external.revalidatePath).not.toHaveBeenCalled();
  });

  it("directly reactivates an identity with complete OIDC authentication", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(membership("REVOKED"));
    database.userFindOne.mockResolvedValue(
      user({
        passwordHash: null,
        oidcIssuer: "https://identity.example.test",
        oidcSubject: "member-1",
      })
    );

    const result = await reactivateMember(
      membershipId.toHexString(),
      { ok: false },
      new FormData()
    );

    expect(result).toEqual({
      ok: true,
      inviteeName: "Member",
      reactivated: true,
    });
    expect(database.membershipCountDocuments).not.toHaveBeenCalled();
    expect(database.membershipUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: "REVOKED" }),
      {
        $set: expect.objectContaining({
          status: "ACTIVE",
          invitationTokenHash: null,
        }),
      },
      expect.objectContaining({ session: expect.anything() })
    );
  });

  it("returns a fresh 48-hour invite instead of activating a passwordless placeholder", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(membership("REVOKED"));
    database.userFindOne.mockResolvedValue(
      user({
        passwordHash: null,
        mustChangePassword: false,
        oidcIssuer: null,
        oidcSubject: null,
      })
    );
    database.membershipCountDocuments.mockResolvedValue(1);

    const result = await reactivateMember(
      membershipId.toHexString(),
      { ok: false },
      new FormData()
    );
    const transactionSession = (
      database.membershipFindOne.mock.calls[1]?.[1] as { session: unknown }
    ).session;

    expect(result).toEqual({
      ok: true,
      inviteeName: "Member",
      inviteUrl: "https://status.example.test/invite/org_invite_test-token",
    });
    expect(database.membershipUpdateOne).toHaveBeenCalledWith(
      {
        _id: membershipId,
        orgId,
        userId,
        status: "REVOKED",
      },
      {
        $set: {
          status: "INVITED",
          invitationExpiresAt: expect.any(Date),
          invitationTokenHash: "new-token-hash",
          activatedAt: null,
        },
      },
      { session: transactionSession }
    );
    expect(database.auditInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REACTIVATE_MEMBER_INVITATION",
        metadata: expect.objectContaining({
          membershipId: membershipId.toHexString(),
          activationMode: "INVITATION",
          invitationExpiresAt: expect.any(Date),
        }),
      }),
      { session: transactionSession }
    );
  });

  it("does not re-invite a passwordless identity with other memberships", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(membership("REVOKED"));
    database.userFindOne.mockResolvedValue(
      user({
        passwordHash: null,
        mustChangePassword: false,
        oidcIssuer: null,
        oidcSubject: null,
      })
    );
    database.membershipCountDocuments.mockResolvedValue(2);

    const result = await reactivateMember(
      membershipId.toHexString(),
      { ok: false },
      new FormData()
    );

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("other organization memberships"),
    });
    expect(database.membershipUpdateOne).not.toHaveBeenCalled();
    expect(database.auditInsertOne).not.toHaveBeenCalled();
  });

  it("does not reactivate a membership for a globally disabled identity", async () => {
    database.membershipFindOne
      .mockResolvedValueOnce(actorMembership())
      .mockResolvedValueOnce(membership("REVOKED"));
    database.userFindOne.mockResolvedValue(user({ disabled: true }));

    const result = await reactivateMember(
      membershipId.toHexString(),
      { ok: false },
      new FormData()
    );

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("disabled across the platform"),
    });
    expect(database.membershipUpdateOne).not.toHaveBeenCalled();
    expect(database.auditInsertOne).not.toHaveBeenCalled();
    expect(external.revalidatePath).not.toHaveBeenCalled();
    expect(database.endSession).toHaveBeenCalledOnce();
  });
});
