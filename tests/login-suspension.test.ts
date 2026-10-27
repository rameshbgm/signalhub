import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "ADMIN", liveRole: null as string | null, active: false, missingOrg: false,
  disabled: false, revoked: false, audit: vi.fn(), create: vi.fn(), tenantAudit: vi.fn(),
}));
const user = { id: "user", username: "operator", email: "operator@example.invalid", passwordHash: "hash" };
const database = vi.hoisted(() => ({
  selectFrom(table: string) {
    const membership = (role: string) => ({ id: "member", userId: "user", orgId: "org", role, status: "ACTIVE" });
    const query = {
      selectAll: () => query, where: () => query, orderBy: () => query,
      execute: async () => table === "memberships" ? [membership(state.role)] : state.active ? [{ id: "org", name: "Operations" }] : [],
      executeTakeFirst: async () => table === "users" ? (state.disabled ? undefined : user)
        : table === "organizations" ? (state.missingOrg ? undefined : { id: "org", status: "SUSPENDED", suspended: true })
        : state.revoked ? undefined : membership(state.liveRole ?? state.role),
    };
    return query;
  },
}));
vi.mock("@/lib/postgres/client", () => ({ database, withDatabaseTransaction: async (run: (db: unknown) => unknown) => run(database) }));
vi.mock("@/lib/auth", () => ({ createSession: state.create, passwordNeedsRehash: () => false }));
vi.mock("@/lib/platform-policy", () => ({ writePlatformAudit: state.audit }));
vi.mock("@/lib/tenant-audit", () => ({ writeActiveTenantAudit: async (_org: unknown, _entry: unknown, run: (db: unknown) => unknown) => { state.tenantAudit(); return run(database); } }));

import { completeLogin } from "@/lib/login-session";
const request = () => new NextRequest("https://signalhub.example/api/auth/login", { method: "POST" });
beforeEach(() => {
  vi.resetAllMocks();
  state.role = "ADMIN"; state.liveRole = null; state.active = false;
  state.missingOrg = false; state.disabled = false; state.revoked = false;
});

it("signs an Admin into platform controls when every organization is suspended", async () => {
  const response = await completeLogin(request(), { userId: "user" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ redirectTo: "/organization/platform", organizations: [] });
  expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ role: "ADMIN", orgId: "org" }), expect.anything());
  expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "PLATFORM_LOGIN", actorRole: "ADMIN", organizationId: "org" }), expect.anything());
  expect(state.tenantAudit).not.toHaveBeenCalled();
});

it.each(["INCIDENT_MANAGER", "RESPONDER", "VIEWER"])("does not grant %s platform recovery access", async role => {
  state.role = role;
  const response = await completeLogin(request(), { userId: "user" });
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("ORGANIZATION_SUSPENDED");
  expect(state.create).not.toHaveBeenCalled(); expect(state.audit).not.toHaveBeenCalled();
});

it.each(["role", "membership"])("rechecks the live %s before creating a recovery session", async change => {
  if (change === "role") state.liveRole = "VIEWER";
  else state.revoked = true;
  await expect(completeLogin(request(), { userId: "user" })).rejects.toMatchObject({ code: "LOGIN_STATE_CHANGED" });
  expect(state.create).not.toHaveBeenCalled(); expect(state.audit).not.toHaveBeenCalled();
});

it("keeps disabled accounts blocked", async () => {
  state.disabled = true;
  expect((await completeLogin(request(), { userId: "user" })).status).toBe(401);
  expect(state.create).not.toHaveBeenCalled();
});

it("does not create a session without an existing organization context", async () => {
  state.missingOrg = true;
  expect((await completeLogin(request(), { userId: "user" })).status).toBe(403);
  expect(state.create).not.toHaveBeenCalled();
});

it("does not issue a session if recording the platform login fails", async () => {
  state.audit.mockRejectedValue(new Error("audit unavailable"));
  await expect(completeLogin(request(), { userId: "user" })).rejects.toThrow("audit unavailable");
  expect(state.create).not.toHaveBeenCalled();
});

it.each(["ADMIN", "VIEWER"])("preserves normal tenant login for an active %s organization", async role => {
  state.active = true; state.role = role;
  const response = await completeLogin(request(), { userId: "user" });
  expect(response.status).toBe(200);
  expect((await response.json()).redirectTo).toBeUndefined();
  expect(state.tenantAudit).toHaveBeenCalledOnce(); expect(state.audit).not.toHaveBeenCalled();
});
