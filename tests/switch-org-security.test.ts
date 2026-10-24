import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ verified: true, temporary: false, role: "ADMIN", create: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ userId: "user", membershipId: "member", orgId: "source", authMethod: "OIDC", mfaVerified: state.verified }), createSession: state.create }));
vi.mock("@/lib/postgres/client", () => ({ database: {
  selectFrom(table: string) {
    const query = { selectAll: () => query, where: () => query, executeTakeFirst: async () => {
      if (table === "memberships") return { id: "member", userId: "user", role: state.role, status: "ACTIVE" };
      if (table === "users") return { id: "user", username: "person", mustChangePassword: state.temporary };
      return { id: "target", status: "ACTIVE", suspended: false };
    } }; return query;
  },
} }));
vi.mock("@/lib/tenant-audit", () => ({ writeActiveTenantAudit: async (_org: unknown, _record: unknown, fn: (db: unknown) => unknown) => { state.audit(); return fn((await import("@/lib/postgres/client")).database); } }));
import { POST } from "@/app/api/auth/switch-org/route";
const request = () => new NextRequest("https://status.example/api/auth/switch-org", { method: "POST", body: JSON.stringify({ orgId: "11111111-1111-4111-8111-111111111111" }) });
beforeEach(() => { state.verified = true; state.temporary = false; state.create.mockClear(); state.audit.mockClear(); });
it.each(["mfa", "password"])("rejects organization switching until %s requirements are met", async (mode) => {
  state.verified = mode !== "mfa"; state.temporary = mode === "password";
  const response = await POST(request());
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe(mode === "mfa" ? "MFA_REQUIRED" : "PASSWORD_CHANGE_REQUIRED");
  expect(state.audit).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled();
});
it("preserves verified SSO authentication through a successful switch", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ orgId: "target" }), { authMethod: "OIDC", mfaVerified: true });
});
