import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mfaVerified: true, mustChangePassword: false, mustCompleteProfile: false }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ userId: "user", orgId: "org" }) }));
vi.mock("@/lib/admin-guard", () => ({ requireOrgSession: async () => ({ userId: "user", orgId: "org", ...state }) }));
vi.mock("@/lib/postgres/client", () => ({ database: { selectFrom() {
  const query = { selectAll: () => query, where: () => query, executeTakeFirst: async () => ({ id: "org", status: "ACTIVE", suspended: false }) };
  return query;
} } }));
import { requireSession } from "@/lib/require-session";

beforeEach(() => { state.mfaVerified = true; state.mustChangePassword = false; state.mustCompleteProfile = false; });

it.each(["mfa", "password", "profile"])("blocks protected page data until %s requirements are complete", async mode => {
  state.mfaVerified = mode !== "mfa";
  state.mustChangePassword = mode === "password";
  state.mustCompleteProfile = mode === "profile";
  await expect(requireSession()).rejects.toThrow(`REDIRECT:${mode === "mfa" ? "/login" : "/organization/change-password"}`);
});

it("retains access for a fully authorized session", async () => {
  await expect(requireSession()).resolves.toMatchObject({ session: { userId: "user", orgId: "org", mfaVerified: true }, org: { id: "org" } });
});
