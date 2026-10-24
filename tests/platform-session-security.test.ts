import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mfaVerified: true, mustChangePassword: false, role: "ADMIN" }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ userId: "user", membershipId: "member", orgId: "org", mfaVerified: state.mfaVerified }) }));
vi.mock("@/lib/postgres/client", () => ({ database: {
  selectFrom(table: string) {
    const query = { selectAll: () => query, where: () => query, executeTakeFirst: async () => {
      if (table === "organizations") return { id: "org", status: "ACTIVE", suspended: false };
      if (table === "memberships") return { id: "member", orgId: "org", userId: "user", role: state.role, status: "ACTIVE" };
      return { id: "user", disabled: false, mustChangePassword: state.mustChangePassword };
    } };
    return query;
  },
} }));
vi.mock("@/lib/settings/effective", () => ({ effectiveSetting: () => ({ value: [] }) }));
vi.mock("@/lib/platform-policy", () => ({ hasPlatformCapability: () => true }));
import { requirePlatformCapability, requireCapability } from "@/lib/admin-guard";
beforeEach(() => { state.mfaVerified = true; state.mustChangePassword = false; state.role = "ADMIN"; });
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
