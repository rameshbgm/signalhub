import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mfaVerified: true, mustChangePassword: false, role: "ADMIN", suspended: false, disabled: false, revoked: false, cidrs: [] as string[] }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ userId: "user", membershipId: "member", orgId: "org", mfaVerified: state.mfaVerified }) }));
vi.mock("@/lib/postgres/client", () => ({ database: {
  selectFrom(table: string) {
    const query = { selectAll: () => query, where: () => query, executeTakeFirst: async () => {
      if (table === "organizations") return { id: "org", status: state.suspended ? "SUSPENDED" : "ACTIVE", suspended: state.suspended };
      if (table === "memberships") return { id: "member", orgId: "org", userId: "user", role: state.role, status: state.revoked ? "REVOKED" : "ACTIVE" };
      return { id: "user", disabled: state.disabled, mustChangePassword: state.mustChangePassword };
    } };
    return query;
  },
} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/settings/effective", () => ({ effectiveSetting: () => ({ value: state.cidrs }) }));
vi.mock("@/lib/platform-policy", () => ({ hasPlatformCapability: () => true }));
import { requirePlatformCapability, requireCapability } from "@/lib/admin-guard";
beforeEach(() => { state.mfaVerified = true; state.mustChangePassword = false; state.role = "ADMIN"; state.suspended = false; state.disabled = false; state.revoked = false; state.cidrs = []; });
it("rejects temporary passwords consistently for platform and organization actions", async () => {
  state.mustChangePassword = true;
  await expect(requirePlatformCapability("users.disable")).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
  await expect(requireCapability("organization.manage")).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
});
it("rejects incomplete MFA for platform actions", async () => {
  state.mfaVerified = false;
  await expect(requirePlatformCapability("configuration.manage")).rejects.toMatchObject({ code: "MFA_REQUIRED" });
});
it("allows a ready Admin and rejects a non-Admin", async () => {
  await expect(requirePlatformCapability("users.disable")).resolves.toMatchObject({ role: "ADMIN" });
  state.role = "VIEWER";
  await expect(requirePlatformCapability("users.disable")).rejects.toMatchObject({ code: "PLATFORM_PERMISSION_REQUIRED" });
});

it("keeps Admin platform access while blocking its suspended organization", async () => {
  state.suspended = true;
  await expect(requirePlatformCapability("organizations.suspend")).resolves.toMatchObject({ role: "ADMIN" });
  await expect(requireCapability("organization.manage")).rejects.toMatchObject({ code: "SESSION_REVOKED" });
  state.role = "RESPONDER";
  await expect(requirePlatformCapability("organizations.suspend")).rejects.toMatchObject({ code: "PLATFORM_PERMISSION_REQUIRED" });
});

it.each(["disabled", "revoked"] as const)("does not let a %s identity use platform recovery access", async field => {
  state.suspended = true; state[field] = true;
  await expect(requirePlatformCapability("organizations.suspend")).rejects.toMatchObject({ code: "SESSION_REVOKED" });
});

it("keeps network and MFA restrictions on platform recovery access", async () => {
  state.suspended = true; state.mfaVerified = false;
  await expect(requirePlatformCapability("organizations.suspend")).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  state.mfaVerified = true; state.cidrs = ["192.0.2.0/24"];
  await expect(requirePlatformCapability("organizations.suspend")).rejects.toMatchObject({ code: "PLATFORM_NETWORK_FORBIDDEN" });
});
