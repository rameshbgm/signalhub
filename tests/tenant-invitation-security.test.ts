import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  membershipFindOne: vi.fn(),
  membershipCountDocuments: vi.fn(),
  membershipUpdateOne: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  organizationFindOne: vi.fn(),
  organizationUpdateOne: vi.fn(),
  auditInsertOne: vi.fn(),
  withTransaction: vi.fn(),
  endSession: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  createSession: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: vi.fn(),
  requestIp: vi.fn(() => "127.0.0.1"),
  RateLimitError: class RateLimitError extends Error {
    retryAfterSeconds = 60;
  },
}));

vi.mock("@/lib/api-response", () => ({
  apiError: (
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>
  ) =>
    Response.json(
      { error: { code, message, ...(fields ? { fields } : {}) } },
      { status }
    ),
  validationError: () =>
    Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input" } },
      { status: 400 }
    ),
  routeError: () =>
    Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 }
    ),
}));

vi.mock("@/lib/organization-state", () => ({
  organizationIsActive: (organization: { status?: string; suspended?: boolean }) =>
    (organization.status ?? (organization.suspended ? "SUSPENDED" : "ACTIVE")) ===
    "ACTIVE",
}));

vi.mock("@/lib/secrets", () => ({
  hashSecret: (secret: string) => `hash:${secret}`,
}));

vi.mock("@/lib/auth", () => auth);

vi.mock("@/lib/db", () => ({
  collections: {
    memberships: () => ({
      findOne: database.membershipFindOne,
      countDocuments: database.membershipCountDocuments,
      updateOne: database.membershipUpdateOne,
    }),
    users: () => ({
      findOne: database.userFindOne,
      updateOne: database.userUpdateOne,
    }),
    organizations: () => ({
      findOne: database.organizationFindOne,
      updateOne: database.organizationUpdateOne,
    }),
    auditLogs: () => ({
      insertOne: database.auditInsertOne,
    }),
  },
  mongoClient: {
    startSession: () => ({
      withTransaction: database.withTransaction,
      endSession: database.endSession,
    }),
  },
}));

vi.mock("@/lib/organization-mutation", () => {
  class OrganizationMutationBlockedError extends Error {}
  return {
    OrganizationMutationBlockedError,
    fenceActiveOrganizationMutation: async (
      organizationId: ObjectId,
      session: unknown
    ) => {
      const result = await database.organizationUpdateOne(
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
      if (result.matchedCount !== 1) {
        throw new OrganizationMutationBlockedError();
      }
    },
  };
});

import { POST } from "../app/api/auth/accept-invite/[token]/route";

const orgId = new ObjectId("000000000000000000000001");
const membershipId = new ObjectId("000000000000000000000002");
const userId = new ObjectId("000000000000000000000003");
const membership = {
  _id: membershipId,
  orgId,
  userId,
  role: "RESPONDER" as const,
  status: "INVITED" as const,
  invitationExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
  invitationTokenHash: "unused-by-mock",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};
const baseUser = {
  _id: userId,
  email: "member@example.test",
  canonicalEmail: "member@example.test",
  passwordHash: null,
  name: "Member",
  twoFactorEnabled: false,
  oidcIssuer: null,
  oidcSubject: null,
  disabled: false,
  mustChangePassword: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function invitationRequest(password = "a-secure-new-password") {
  return new Request("https://status.example.test/api/auth/accept-invite/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("tenant invitation acceptance security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.withTransaction.mockImplementation(
      async (callback: () => Promise<unknown>) => callback()
    );
    database.endSession.mockResolvedValue(undefined);
    database.organizationFindOne.mockResolvedValue({
      _id: orgId,
      name: "Acme",
      status: "ACTIVE",
      suspended: false,
    });
    database.organizationUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });
    database.membershipCountDocuments.mockResolvedValue(1);
    database.userUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });
    database.membershipUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });
    database.auditInsertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId(),
    });
    auth.hashPassword.mockResolvedValue("new-password-hash");
    auth.verifyPassword.mockResolvedValue(true);
  });

  it("accepts a new identity once, sets its password, and consumes the token", async () => {
    let invitationAvailable = true;
    database.membershipFindOne.mockImplementation(async () =>
      invitationAvailable ? membership : null
    );
    database.userFindOne.mockResolvedValue(baseUser);
    database.membershipUpdateOne.mockImplementation(async () => {
      invitationAvailable = false;
      return {
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
      };
    });

    const first = await POST(invitationRequest() as never, {
      params: Promise.resolve({ token: "org_invite_test" }),
    });
    const second = await POST(invitationRequest() as never, {
      params: Promise.resolve({ token: "org_invite_test" }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
    expect(database.userUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: userId,
        passwordHash: null,
        disabled: { $ne: true },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          passwordHash: "new-password-hash",
          mustChangePassword: false,
        }),
      }),
      expect.objectContaining({ session: expect.anything() })
    );
    expect(database.membershipUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: membershipId,
        status: "INVITED",
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "ACTIVE",
          invitationTokenHash: null,
        }),
      }),
      expect.objectContaining({ session: expect.anything() })
    );
    expect(database.organizationUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: orgId,
        $or: expect.arrayContaining([{ status: "ACTIVE" }]),
      }),
      { $inc: { mutationRevision: 1 } },
      expect.objectContaining({ session: expect.anything() })
    );
    expect(auth.createSession).toHaveBeenCalledOnce();
  });

  it("does not accept an invitation that races with organization suspension", async () => {
    database.membershipFindOne.mockResolvedValue(membership);
    database.userFindOne.mockResolvedValue(baseUser);
    database.organizationUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
    });

    const response = await POST(invitationRequest() as never, {
      params: Promise.resolve({ token: "org_invite_suspended_during_accept" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("INVITATION_UNAVAILABLE");
    expect(database.userUpdateOne).not.toHaveBeenCalled();
    expect(database.membershipUpdateOne).not.toHaveBeenCalled();
    expect(database.auditInsertOne).not.toHaveBeenCalled();
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it("refuses to set a password for a legacy OIDC identity", async () => {
    database.membershipFindOne.mockResolvedValue(membership);
    database.userFindOne.mockResolvedValue({
      ...baseUser,
      oidcIssuer: "https://identity.example.test",
      oidcSubject: "member-1",
    });
    database.membershipCountDocuments.mockResolvedValue(1);

    const response = await POST(invitationRequest() as never, {
      params: Promise.resolve({ token: "org_invite_legacy" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("INVITATION_IDENTITY_CONFLICT");
    expect(database.userUpdateOne).not.toHaveBeenCalled();
    expect(database.membershipUpdateOne).not.toHaveBeenCalled();
    expect(auth.createSession).not.toHaveBeenCalled();
  });

  it("refuses to set a global password when a passwordless identity has another membership", async () => {
    database.membershipFindOne.mockResolvedValue(membership);
    database.userFindOne.mockResolvedValue(baseUser);
    database.membershipCountDocuments.mockResolvedValue(2);

    const response = await POST(invitationRequest() as never, {
      params: Promise.resolve({ token: "org_invite_multi_org" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("INVITATION_IDENTITY_CONFLICT");
    expect(database.userUpdateOne).not.toHaveBeenCalled();
    expect(database.membershipUpdateOne).not.toHaveBeenCalled();
    expect(auth.createSession).not.toHaveBeenCalled();
  });
});
