import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logoutState = vi.hoisted(() => ({
  platformSession: null as Record<string, unknown> | null,
  orgSession: null as Record<string, unknown> | null,
  supportSessions: [] as Array<Record<string, unknown>>,
  supportUpdateError: null as Error | null,
  supportUpdates: [] as Array<unknown[]>,
  tenantAuditEntries: [] as Array<Record<string, unknown>>,
  blockedTenantAuditOrgIds: new Set<string>(),
  platformAuditEntries: [] as Array<Record<string, unknown>>,
  destroyedPlatformSessions: 0,
  destroyedOrgSessions: 0,
}));

const lifecycleErrors = vi.hoisted(() => ({
  OrganizationMutationBlockedError: class OrganizationMutationBlockedError extends Error {},
}));

vi.mock("@/lib/auth", () => ({
  getPlatformSession: async () => logoutState.platformSession,
  getSession: async () => logoutState.orgSession,
  destroyPlatformSession: async () => {
    logoutState.destroyedPlatformSessions += 1;
  },
  destroySession: async () => {
    logoutState.destroyedOrgSessions += 1;
  },
}));

vi.mock("@/lib/db", () => ({
  collections: {
    supportSessions: () => ({
      find: () => ({
        toArray: async () => logoutState.supportSessions,
      }),
      updateMany: async (...args: unknown[]) => {
        logoutState.supportUpdates.push(args);
        if (logoutState.supportUpdateError) throw logoutState.supportUpdateError;
        return { modifiedCount: logoutState.supportSessions.length };
      },
    }),
  },
}));

vi.mock("@/lib/organization-mutation", () => lifecycleErrors);

vi.mock("@/lib/tenant-audit", () => ({
  writeActiveTenantAudit: async (
    orgId: { toHexString(): string },
    entry: Record<string, unknown>
  ) => {
    if (logoutState.blockedTenantAuditOrgIds.has(orgId.toHexString())) {
      throw new lifecycleErrors.OrganizationMutationBlockedError();
    }
    logoutState.tenantAuditEntries.push({ orgId, ...entry });
  },
}));

vi.mock("@/lib/platform-policy", () => ({
  writePlatformAudit: async (entry: Record<string, unknown>) => {
    logoutState.platformAuditEntries.push(entry);
  },
}));

vi.mock("@/lib/mongo-utils", () => ({
  oid: (value: string) => ({
    toHexString: () => value,
  }),
}));

import { POST } from "../app/api/auth/platform-logout/route";

describe("platform logout", () => {
  beforeEach(() => {
    logoutState.platformSession = null;
    logoutState.orgSession = null;
    logoutState.supportSessions = [];
    logoutState.supportUpdateError = null;
    logoutState.supportUpdates.length = 0;
    logoutState.tenantAuditEntries.length = 0;
    logoutState.blockedTenantAuditOrgIds.clear();
    logoutState.platformAuditEntries.length = 0;
    logoutState.destroyedPlatformSessions = 0;
    logoutState.destroyedOrgSessions = 0;
  });

  it("revokes all active support sessions, audits them, and clears the support org cookie", async () => {
    const platformAdminId = new ObjectId();
    const orgId = new ObjectId();
    const firstSupportId = new ObjectId();
    const secondSupportId = new ObjectId();
    logoutState.platformSession = {
      platformAdminId: platformAdminId.toHexString(),
      email: "operator@example.test",
      name: "Operator",
      role: "OPERATOR",
      sessionVersion: 1,
      mfaVerified: true,
    };
    logoutState.orgSession = {
      userId: new ObjectId().toHexString(),
      membershipId: new ObjectId().toHexString(),
      orgId: orgId.toHexString(),
      email: "owner@example.test",
      name: "Owner",
      role: "OWNER",
      supportSessionId: firstSupportId.toHexString(),
      supportActorEmail: "operator@example.test",
    };
    logoutState.supportSessions = [
      {
        _id: firstSupportId,
        platformAdminId,
        orgId,
        mode: "VIEW",
      },
      {
        _id: secondSupportId,
        platformAdminId,
        orgId,
        mode: "OPERATE",
      },
    ];

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(logoutState.supportUpdates).toHaveLength(1);
    expect(logoutState.supportUpdates[0][1]).toMatchObject({
      $set: {
        revokedReason: "platform administrator logout",
        revokedBy: expect.anything(),
        revokedAt: expect.any(Date),
        endedAt: expect.any(Date),
      },
    });
    expect(logoutState.tenantAuditEntries).toHaveLength(2);
    expect(logoutState.tenantAuditEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "SUPPORT_SESSION_ENDED",
          target: firstSupportId.toHexString(),
        }),
        expect.objectContaining({
          action: "SUPPORT_SESSION_ENDED",
          target: secondSupportId.toHexString(),
        }),
      ])
    );
    expect(logoutState.platformAuditEntries).toContainEqual(
      expect.objectContaining({
        action: "PLATFORM_LOGOUT",
        metadata: {
          revokedSupportSessionCount: 2,
          clearedSupportOrgSession: true,
          lifecycleError: null,
        },
      })
    );
    expect(logoutState.destroyedPlatformSessions).toBe(1);
    expect(logoutState.destroyedOrgSessions).toBe(1);
  });

  it("still clears local platform and support cookies when server-side revocation fails", async () => {
    const platformAdminId = new ObjectId();
    const supportSessionId = new ObjectId();
    logoutState.platformSession = {
      platformAdminId: platformAdminId.toHexString(),
      email: "operator@example.test",
      name: "Operator",
      role: "OPERATOR",
      sessionVersion: 1,
      mfaVerified: true,
    };
    logoutState.orgSession = {
      userId: new ObjectId().toHexString(),
      membershipId: new ObjectId().toHexString(),
      orgId: new ObjectId().toHexString(),
      email: "owner@example.test",
      name: "Owner",
      role: "OWNER",
      supportSessionId: supportSessionId.toHexString(),
    };
    logoutState.supportSessions = [
      {
        _id: supportSessionId,
        platformAdminId,
        orgId: new ObjectId(),
        mode: "VIEW",
      },
    ];
    logoutState.supportUpdateError = new Error("database unavailable");

    const response = await POST();

    expect(response.status).toBe(503);
    expect(logoutState.destroyedPlatformSessions).toBe(1);
    expect(logoutState.destroyedOrgSessions).toBe(1);
    expect(logoutState.platformAuditEntries).toContainEqual(
      expect.objectContaining({
        action: "PLATFORM_LOGOUT",
        metadata: expect.objectContaining({
          lifecycleError: "support session cleanup failed",
        }),
      })
    );
  });

  it("skips tenant audit copies after lifecycle cleanup without blocking logout", async () => {
    const platformAdminId = new ObjectId();
    const orgId = new ObjectId();
    const supportSessionId = new ObjectId();
    logoutState.platformSession = {
      platformAdminId: platformAdminId.toHexString(),
      email: "operator@example.test",
      name: "Operator",
      role: "OPERATOR",
      sessionVersion: 1,
      mfaVerified: true,
    };
    logoutState.orgSession = {
      userId: new ObjectId().toHexString(),
      membershipId: new ObjectId().toHexString(),
      orgId: orgId.toHexString(),
      email: "owner@example.test",
      name: "Owner",
      role: "OWNER",
      supportSessionId: supportSessionId.toHexString(),
    };
    logoutState.supportSessions = [
      {
        _id: supportSessionId,
        platformAdminId,
        orgId,
        mode: "OPERATE",
      },
    ];
    logoutState.blockedTenantAuditOrgIds.add(orgId.toHexString());

    const response = await POST();

    expect(response.status).toBe(200);
    expect(logoutState.tenantAuditEntries).toHaveLength(0);
    expect(logoutState.platformAuditEntries).toContainEqual(
      expect.objectContaining({
        action: "PLATFORM_LOGOUT",
        metadata: expect.objectContaining({ lifecycleError: null }),
      })
    );
    expect(logoutState.destroyedPlatformSessions).toBe(1);
    expect(logoutState.destroyedOrgSessions).toBe(1);
  });
});
