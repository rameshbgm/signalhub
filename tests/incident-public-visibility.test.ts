import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "ADMIN", orgId: "org", pageIds: null as string[] | null,
  incidents: [] as Array<{ id: string; pageId: string; orgId: string; slug: string; hubParentId: null; isMaintenance: boolean; publicVisible: boolean; pageWide: boolean }>,
  update: vi.fn(), audit: vi.fn(), revalidate: vi.fn(), notify: vi.fn(),
}));
vi.mock("@/lib/postgres/client", () => {
  const executor = {
    selectFrom(table: string) {
      let rows: Array<Record<string, unknown>> = table.startsWith("incidents") ? state.incidents : [];
      const query = {
        select() { return query; }, selectAll() { return query; }, innerJoin() { return query; }, forUpdate() { return query; }, orderBy() { return query; }, limit() { return query; },
        where(column: string, op: string, value: unknown) {
          const key = column === "page.orgId" ? "orgId" : column.split(".").at(-1)!;
          rows = rows.filter((row) => op === "in" ? (value as unknown[]).includes(row[key]) : op === "is" ? (row[key] ?? null) === value : row[key] === value);
          return query;
        },
        execute: async () => rows, executeTakeFirst: async () => rows[0],
      };
      return query;
    },
    updateTable(table: string) {
      let data: Record<string, unknown>; let id: unknown;
      const query = { set(value: Record<string, unknown>) { data = value; return query; }, where(_column: string, _op: string, value: unknown) { id = value; return query; }, execute: async () => {
        state.update(table, data!);
        const incident = state.incidents.find((row) => row.id === id);
        if (incident) Object.assign(incident, data!);
      } };
      return query;
    },
  };
  return { database: executor, withDatabaseTransaction: async (callback: (transaction: typeof executor) => unknown) => callback(executor) };
});
vi.mock("@/lib/admin-guard", async () => {
  const { hasCapability } = await import("@/lib/identity");
  return {
    requireCapability: async (capability: Parameters<typeof hasCapability>[1], pageId?: string) => {
      if (!hasCapability(state.role, capability)) throw new Error("Permission denied");
      if (pageId && state.role !== "ADMIN" && state.pageIds && !state.pageIds.includes(pageId)) throw new Error("Page scope forbidden");
      return { role: state.role, orgId: state.orgId, userId: "operator", email: "operator@example.com" };
    },
    assertPageInOrg: async (pageId: string, orgId: string) => { if (!state.incidents.some((row) => row.pageId === pageId && row.orgId === orgId)) throw new Error("Page not found in your organization"); },
  };
});
vi.mock("@/lib/organization-mutation", () => ({ fenceActiveOrganizationMutation: vi.fn() }));
vi.mock("@/lib/notify", () => ({ dispatchNotifications: state.notify }));
vi.mock("@/lib/support-audit", () => ({ writeSupportMutationAudit: vi.fn() }));
vi.mock("@/lib/tenant-audit", () => ({ writeActiveTenantAudit: state.audit }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { deleteIncident, setIncidentPublicVisibility } from "@/app/admin/(protected)/incidents/actions";
import { getIncidentsForPage, isIncidentVisibleToScope } from "@/lib/public-data";

const incidentId = "11111111-1111-4111-8111-111111111111";
const pageId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks(); state.role = "ADMIN"; state.orgId = "org"; state.pageIds = null;
  state.incidents = [{ id: incidentId, pageId, orgId: "org", slug: "payments", hubParentId: null, isMaintenance: false, publicVisible: true, pageWide: true }];
});

describe("reversible incident public visibility", () => {
  it.each(["ADMIN", "INCIDENT_MANAGER"])("allows %s to hide and restore without deleting the record", async (role) => {
    state.role = role;
    await setIncidentPublicVisibility(incidentId, false);
    expect(state.incidents).toHaveLength(1);
    expect(state.incidents[0].publicVisible).toBe(false);
    expect(await getIncidentsForPage(pageId, null)).toEqual([]);
    expect(await isIncidentVisibleToScope(incidentId, pageId, null)).toBe(false);
    await setIncidentPublicVisibility(incidentId, true);
    expect(await getIncidentsForPage(pageId, null)).toHaveLength(1);
    expect(await isIncidentVisibleToScope(incidentId, pageId, null)).toBe(true);
    expect(state.update).toHaveBeenNthCalledWith(1, "incidents", { publicVisible: false });
    expect(state.update).toHaveBeenNthCalledWith(2, "incidents", { publicVisible: true });
    expect(state.audit).toHaveBeenCalledWith("org", expect.objectContaining({ action: "HIDE_INCIDENT" }));
    expect(state.audit).toHaveBeenCalledWith("org", expect.objectContaining({ action: "UNHIDE_INCIDENT" }));
    expect(state.revalidate).toHaveBeenCalledWith("/payments", "layout");
    expect(state.notify).not.toHaveBeenCalled();
  });

  it.each(["RESPONDER", "VIEWER"])("rejects %s on the server", async (role) => {
    state.role = role;
    await expect(setIncidentPublicVisibility(incidentId, false)).rejects.toThrow("Permission denied");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("rejects an incident manager outside the assigned page scope", async () => {
    state.role = "INCIDENT_MANAGER"; state.pageIds = ["another-page"];
    await expect(setIncidentPublicVisibility(incidentId, false)).rejects.toThrow("Page scope forbidden");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("rejects cross-organization visibility changes", async () => {
    state.orgId = "another-org";
    await expect(setIncidentPublicVisibility(incidentId, false)).rejects.toThrow("your organization");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("blocks the old incident delete action", async () => {
    await expect(deleteIncident(incidentId)).rejects.toThrow("cannot be deleted");
    expect(state.incidents).toHaveLength(1);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("keeps hidden incidents in the private record while denying public permalinks", async () => {
    state.incidents[0].publicVisible = false;
    expect(await isIncidentVisibleToScope(incidentId, pageId, null)).toBe(false);
    expect(state.incidents[0].id).toBe(incidentId);
  });
});
