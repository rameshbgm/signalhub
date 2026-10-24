import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  active: true,
  session: null as Record<string, unknown> | null,
  tables: {} as Record<string, Record<string, unknown> | undefined>,
}));

vi.mock("@/lib/auth", () => ({
  credentialVersion: (hash: string | null | undefined) => (hash ? `cv:${hash}` : ""),
  getPageAccessSession: async () => state.session,
}));
vi.mock("@/lib/public-page", () => ({ isPageOrganizationActive: async () => state.active }));
vi.mock("@/lib/postgres/client", () => ({
  database: {
    selectFrom: (table: string) => {
      const builder = { select: () => builder, selectAll: () => builder, where: () => builder, executeTakeFirst: async () => state.tables[table] };
      return builder;
    },
  },
}));

import { checkPageAccess } from "@/lib/access";
import { narrowSubscriberScope, resolveSubscriptionScope } from "@/lib/public-surface-policy";
import { safeReturnTo } from "@/lib/public-path";

const privatePage = { id: "p1", type: "PRIVATE", orgId: "o1" };
const audiencePage = { id: "p1", type: "AUDIENCE", orgId: "o1" };

beforeEach(() => {
  state.active = true;
  state.session = null;
  state.tables = {};
});

describe("checkPageAccess", () => {
  it("lets anyone view a public page", async () => {
    expect(await checkPageAccess({ ...privatePage, type: "PUBLIC" })).toEqual({ ok: true, visibleComponentIds: null });
  });

  it("hides every page of an inactive organization", async () => {
    state.active = false;
    expect(await checkPageAccess({ ...privatePage, type: "PUBLIC" })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("asks for the password without a session", async () => {
    expect(await checkPageAccess(privatePage)).toEqual({ ok: false, reason: "password" });
  });

  it("accepts a private session only while the password is unchanged", async () => {
    state.tables.pages = { passwordHash: "old" };
    state.session = { pageId: "p1", cv: "cv:old" };
    expect(await checkPageAccess(privatePage)).toEqual({ ok: true, visibleComponentIds: null });
    state.tables.pages = { passwordHash: "rotated" };
    expect(await checkPageAccess(privatePage)).toEqual({ ok: false, reason: "password" });
  });

  it("rejects a session issued for another page", async () => {
    state.tables.pages = { passwordHash: "old" };
    state.session = { pageId: "other", cv: "cv:old" };
    expect(await checkPageAccess(privatePage)).toEqual({ ok: false, reason: "password" });
  });

  it("asks audience visitors to sign in without a session", async () => {
    expect(await checkPageAccess(audiencePage)).toEqual({ ok: false, reason: "login" });
  });

  it("merges a user's own services with their group's", async () => {
    state.session = { pageId: "p1", userId: "u1", cv: "cv:h" };
    state.tables.pageAccessUsers = { passwordHash: "h", groupId: "g1", componentIds: ["a", "b"] };
    state.tables.pageAccessGroups = { componentIds: ["b", "c"] };
    expect(await checkPageAccess(audiencePage)).toEqual({ ok: true, visibleComponentIds: ["a", "b", "c"] });
  });

  it("shows nothing to an audience user with no services", async () => {
    state.session = { pageId: "p1", userId: "u1", cv: "cv:h" };
    state.tables.pageAccessUsers = { passwordHash: "h", groupId: null, componentIds: [] };
    expect(await checkPageAccess(audiencePage)).toEqual({ ok: true, visibleComponentIds: [] });
  });

  it("signs out a deleted audience user and one whose password changed", async () => {
    state.session = { pageId: "p1", userId: "u1", cv: "cv:h" };
    expect(await checkPageAccess(audiencePage)).toEqual({ ok: false, reason: "login" });
    state.tables.pageAccessUsers = { passwordHash: "changed", groupId: null, componentIds: ["a"] };
    expect(await checkPageAccess(audiencePage)).toEqual({ ok: false, reason: "login" });
  });
});

describe("resolveSubscriptionScope", () => {
  it("passes the request through for unscoped visitors", () => {
    expect(resolveSubscriptionScope(null, ["a"])).toEqual({ ok: true, componentIds: ["a"] });
    expect(resolveSubscriptionScope(null, [])).toEqual({ ok: true, componentIds: [] });
  });

  it("defaults a scoped visitor to their visible services, never to all", () => {
    expect(resolveSubscriptionScope(["a", "b"], [])).toEqual({ ok: true, componentIds: ["a", "b"] });
  });

  it("refuses a scoped visitor with nothing visible", () => {
    expect(resolveSubscriptionScope([], [])).toEqual({ ok: false });
  });

  it("refuses services outside the visitor's scope", () => {
    expect(resolveSubscriptionScope(["a"], ["b"])).toEqual({ ok: false });
  });

  it("lets a hub visitor subscribe without services", () => {
    expect(resolveSubscriptionScope([], [], true)).toEqual({ ok: true, componentIds: [] });
  });
});

describe("narrowSubscriberScope", () => {
  it("keeps only services the visitor can still see", () => {
    expect(narrowSubscriberScope(["a", "b"], ["b", "c"])).toEqual(["b"]);
  });

  it("replaces an all-services subscription with the visitor's scope", () => {
    expect(narrowSubscriberScope([], ["a"])).toEqual(["a"]);
  });

  it("removes the subscription when nothing is left", () => {
    expect(narrowSubscriberScope(["a"], ["b"])).toBeNull();
    expect(narrowSubscriberScope(["a"], [])).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("keeps same-origin paths", () => {
    expect(safeReturnTo("/hub/cloud?x=1", "/f")).toBe("/hub/cloud?x=1");
  });

  it.each([
    "//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/\t/evil.com", "", undefined,
    // dot segments collapse to a protocol-relative "//evil.com" once parsed
    "/.//evil.com", "/a/..//evil.com", "/%2e//evil.com", "/%2E/%2e//evil.com",
  ])(
    "falls back for %j",
    (value) => expect(safeReturnTo(value, "/f")).toBe("/f")
  );
});
