import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ orgId: "", userId: "", denyMonitor: false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/admin-guard", () => ({
  requireCapability: async (capability: string) => {
    if (capability === "monitor.manage" && auth.denyMonitor) throw new Error("Monitor permission required");
    return { orgId: auth.orgId, userId: auth.userId, email: "services@example.invalid", role: "ADMIN" };
  },
  assertPageInOrg: vi.fn(),
  assertComponentInPage: vi.fn(),
  assertGroupInPage: vi.fn(),
}));

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = Boolean(url && /test/i.test(new URL(url).pathname));
if (url && !enabled) throw new Error("Service creation tests require a disposable database named test");
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("manual and automatic service creation", () => {
  let db: typeof import("@/lib/postgres/client");
  let actions: typeof import("@/app/admin/(protected)/pages/[pageId]/components-actions");
  let pageActions: typeof import("@/app/admin/(protected)/pages/actions");
  let statuses: typeof import("@/lib/component-status");
  let pageId: string;
  let otherPageId: string;

  function form(name: string, source = "MANUAL", monitorId = "") {
    const data = new FormData();
    data.set("name", name);
    data.set("statusSource", source);
    if (monitorId) data.set("monitorId", monitorId);
    return data;
  }

  async function monitor(overrides: { pageId?: string; enabled?: boolean; isDown?: boolean; actionFlipStatus?: boolean } = {}) {
    return db.database.insertInto("monitors").values({
      pageId, name: `Check ${randomUUID()}`, type: "HTTP", target: "https://example.invalid",
      intervalSec: 60, timeoutMs: 1000, downStatus: "MAJOR_OUTAGE", ...overrides,
    } as never).returningAll().executeTakeFirstOrThrow();
  }

  async function service(name: string) {
    return db.database.selectFrom("components").selectAll().where("pageId", "=", pageId).where("name", "=", name).executeTakeFirstOrThrow();
  }

  beforeAll(async () => {
    db = await import("@/lib/postgres/client");
    await (await import("@/lib/migrations")).runMigrations();
    actions = await import("@/app/admin/(protected)/pages/[pageId]/components-actions");
    pageActions = await import("@/app/admin/(protected)/pages/actions");
    statuses = await import("@/lib/component-status");
    const stamp = randomUUID();
    auth.orgId = (await db.database.insertInto("organizations").values({ name: "Services", slug: `services-${stamp}` } as never).returning("id").executeTakeFirstOrThrow()).id;
    auth.userId = (await db.database.insertInto("users").values({
      username: `services-${stamp}`, canonicalUsername: `services-${stamp}`, email: `${stamp}@example.invalid`, canonicalEmail: `${stamp}@example.invalid`, name: "Services",
    } as never).returning("id").executeTakeFirstOrThrow()).id;
    for (const name of ["Services", "Other page"]) {
      const data = new FormData();
      data.set("name", name);
      await expect(pageActions.createPage(data)).rejects.toThrow("REDIRECT:/organization/pages/");
    }
    const pages = await db.database.selectFrom("pages").select(["id", "name"]).where("orgId", "=", auth.orgId).execute();
    pageId = pages.find((page) => page.name === "Services")!.id;
    otherPageId = pages.find((page) => page.name === "Other page")!.id;
  }, 60_000);

  afterAll(async () => { await db?.closeDatabase(); });

  it("creates an empty hidden page and requires a service before publishing", async () => {
    expect(await db.database.selectFrom("components").selectAll().where("pageId", "=", pageId).execute()).toEqual([]);
    expect(await db.database.selectFrom("pages").select(["publicVisible", "setupCompletedAt"]).where("id", "=", pageId).executeTakeFirstOrThrow()).toEqual({ publicVisible: false, setupCompletedAt: null });
    await expect(pageActions.finishPageSetup(pageId)).rejects.toThrow("Add at least one visible service");
  });

  it("creates a manual service without linking or creating monitors", async () => {
    const unlinked = await monitor();
    await actions.createComponent(pageId, form("Manual", "MANUAL", unlinked.id));
    expect(await service("Manual")).toMatchObject({ status: "OPERATIONAL", manualStatus: "OPERATIONAL", visible: true });
    expect((await db.database.selectFrom("monitors").select("componentId").where("id", "=", unlinked.id).executeTakeFirstOrThrow()).componentId).toBeNull();
  });

  it("links an existing failed monitor, enables status updates and recovers automatically", async () => {
    const check = await monitor({ isDown: true, actionFlipStatus: false });
    await actions.createComponent(pageId, form("Automatic", "AUTOMATIC", check.id));
    const created = await service("Automatic");
    expect(created).toMatchObject({ status: "MAJOR_OUTAGE", manualStatus: "OPERATIONAL" });
    expect(await db.database.selectFrom("monitors").select(["componentId", "actionFlipStatus"]).where("id", "=", check.id).executeTakeFirstOrThrow()).toEqual({ componentId: created.id, actionFlipStatus: true });
    const events = await db.database.selectFrom("componentStatusEvents").select("status").where("componentId", "=", created.id).execute();
    expect(events).toEqual([{ status: "MAJOR_OUTAGE" }]);
    await db.database.updateTable("monitors").set({ isDown: false }).where("id", "=", check.id).execute();
    await statuses.reconcileComponentStatus(created.id);
    expect((await service("Automatic")).status).toBe("OPERATIONAL");
  });

  it("keeps the service automatic when its monitor is paused", async () => {
    const check = await monitor({ isDown: true, enabled: false });
    await actions.createComponent(pageId, form("Paused", "AUTOMATIC", check.id));
    expect((await service("Paused")).status).toBe("OPERATIONAL");
    await db.database.updateTable("monitors").set({ enabled: true }).where("id", "=", check.id).execute();
    await statuses.reconcileComponentStatus((await service("Paused")).id);
    expect((await service("Paused")).status).toBe("MAJOR_OUTAGE");
  });

  it("keeps manual status controls from overriding automatic services, including bulk edits", async () => {
    const automatic = await service("Automatic");
    await expect(actions.updateComponentStatus(pageId, automatic.id, new FormData())).rejects.toThrow("Select only manual services");
    await expect(actions.bulkComponentAction(pageId, [automatic.id, (await service("Manual")).id], "status", "MAJOR_OUTAGE")).rejects.toThrow("Select only manual services");
    expect((await service("Manual")).status).toBe("OPERATIONAL");
    const data = new FormData();
    data.set("status", "DEGRADED_PERFORMANCE");
    await actions.updateComponentStatus(pageId, (await service("Manual")).id, data);
    expect((await service("Manual")).status).toBe("DEGRADED_PERFORMANCE");
  });

  it("preserves other status contributions when a monitor recovers", async () => {
    const check = await monitor({ isDown: true });
    await actions.createComponent(pageId, form("Override", "AUTOMATIC", check.id));
    const created = await service("Override");
    await statuses.setComponentStatus(created.id, "PARTIAL_OUTAGE");
    await db.database.updateTable("monitors").set({ isDown: false }).where("id", "=", check.id).execute();
    await statuses.reconcileComponentStatus(created.id);
    expect((await service("Override")).status).toBe("PARTIAL_OUTAGE");
  });

  it("rejects missing, malformed, unknown and other-page monitors without creating a service", async () => {
    const foreign = await monitor({ pageId: otherPageId });
    for (const id of ["", "invalid", randomUUID(), foreign.id]) {
      await expect(actions.createComponent(pageId, form("Invalid", "AUTOMATIC", id))).rejects.toThrow(/Choose a monitor|Monitor not found/);
    }
    expect(await db.database.selectFrom("components").select("id").where("pageId", "=", pageId).where("name", "=", "Invalid").execute()).toEqual([]);
  });

  it("requires monitor management permission for an automatic service", async () => {
    auth.denyMonitor = true;
    try {
      await expect(actions.createComponent(pageId, form("Denied", "AUTOMATIC", randomUUID()))).rejects.toThrow("Monitor permission required");
    } finally { auth.denyMonitor = false; }
  });

  it("does not steal an already-linked monitor, even with simultaneous submissions", async () => {
    const check = await monitor();
    const results = await Promise.allSettled([
      actions.createComponent(pageId, form("Concurrent A", "AUTOMATIC", check.id)),
      actions.createComponent(pageId, form("Concurrent B", "AUTOMATIC", check.id)),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const created = await db.database.selectFrom("components").select("id").where("pageId", "=", pageId).where("name", "in", ["Concurrent A", "Concurrent B"]).execute();
    expect(created).toHaveLength(1);
    expect((await db.database.selectFrom("monitors").select("componentId").where("id", "=", check.id).executeTakeFirstOrThrow()).componentId).toBe(created[0].id);
  });
});
