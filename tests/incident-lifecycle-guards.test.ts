import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  incident: { id: "33333333-3333-4333-8333-333333333333", pageId: "22222222-2222-4222-8222-222222222222", status: "RESOLVED", name: "Payment outage", impact: "MAJOR", backfilled: false, publicVisible: true, pageWide: false, resolvedAt: new Date(), slug: "payments", hubParentId: null },
  componentId: "11111111-1111-4111-8111-111111111111",
  updateId: "44444444-4444-4444-8444-444444444444",
  write: vi.fn(),
  notify: vi.fn(),
  setData: vi.fn(),
  reconcile: vi.fn(),
  inserted: vi.fn(),
  links: [{ componentId: "11111111-1111-4111-8111-111111111111", newStatus: "MAJOR_OUTAGE" }],
  latestBody: "Original resolution message",
  latestEditedAt: null as Date | null,
}));

vi.mock("@/lib/postgres/client", () => {
  const executor = {
    selectFrom(table: string) {
      const rows = table.startsWith("incidents") ? [state.incident] : table === "components" ? [{ id: state.componentId }] : table === "incidentComponents" ? state.links : [{ id: state.updateId, status: "RESOLVED", body: state.latestBody, editedAt: state.latestEditedAt, notified: true }];
      const query = {
        select() { return query; }, selectAll() { return query; }, innerJoin() { return query; }, where() { return query; }, forUpdate() { return query; }, orderBy() { return query; },
        execute: async () => rows, executeTakeFirst: async () => rows[0],
      };
      return query;
    },
    updateTable: state.write, insertInto: state.write, deleteFrom: state.write,
  };
  return { database: executor, withDatabaseTransaction: async (callback: (transaction: typeof executor) => unknown) => callback(executor) };
});
vi.mock("@/lib/admin-guard", () => ({ requireCapability: async () => ({ orgId: "org", userId: "user", email: "operator@example.com" }), assertPageInOrg: vi.fn() }));
vi.mock("@/lib/organization-mutation", () => ({ fenceActiveOrganizationMutation: vi.fn() }));
vi.mock("@/lib/component-status", () => ({ reconcileComponents: state.reconcile }));
vi.mock("@/lib/notify", () => ({ dispatchNotifications: state.notify }));
vi.mock("@/lib/support-audit", () => ({ writeSupportMutationAudit: vi.fn() }));
vi.mock("@/lib/tenant-audit", () => ({ writeActiveTenantAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { editIncidentDetails, editIncidentUpdate } from "@/app/admin/(protected)/incidents/actions";
import { addIncidentUpdate } from "@/lib/domain/incidents";

function details() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Payment outage", body: "Payments have recovered.", status: "RESOLVED", impact: "MAJOR", componentIds: state.componentId, latestUpdateId: state.updateId, [`componentStatus_${state.componentId}`]: "MAJOR_OUTAGE" })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.incident.status = "RESOLVED";
  state.incident.publicVisible = true;
  state.latestBody = "Original resolution message";
  state.latestEditedAt = null;
  state.links = [{ componentId: state.componentId, newStatus: "MAJOR_OUTAGE" }];
  state.write.mockImplementation(() => {
    const mutation = { set(value: unknown) { state.setData(value); return mutation; }, where() { return mutation; }, values(value: unknown) { state.inserted(value); return mutation; }, returningAll() { return mutation; }, returning() { return mutation; }, executeTakeFirstOrThrow: async () => ({ id: state.updateId }), execute: async () => [] };
    return mutation;
  });
});

describe("server incident lifecycle guards", () => {
  it("allows a resolved message correction without reopening or sending a notification", async () => {
    await expect(editIncidentDetails(state.incident.id, details())).resolves.toBeUndefined();
    expect(state.setData).toHaveBeenCalledWith(expect.objectContaining({ body: "Payments have recovered.", editedAt: expect.any(Date) }));
    expect(state.setData).not.toHaveBeenCalledWith(expect.objectContaining({ resolvedAt: expect.anything() }));
    expect(state.setData).not.toHaveBeenCalledWith(expect.objectContaining({ notified: expect.anything() }));
    expect(state.write).not.toHaveBeenCalledWith("incidentComponents");
    expect(state.reconcile).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });

  it("allows correcting the latest resolved timeline message while preserving its final status", async () => {
    const data = new FormData(); data.set("status", "RESOLVED"); data.set("body", "Corrected resolution message");
    await expect(editIncidentUpdate(state.incident.id, state.updateId, data)).resolves.toBeUndefined();
    expect(state.setData).toHaveBeenCalledWith(expect.objectContaining({ body: "Corrected resolution message" }));
    expect(state.notify).not.toHaveBeenCalled();
  });
  it("rejects a direct request to reopen a resolved incident through details", async () => {
    const data = details(); data.set("status", "INVESTIGATING");
    await expect(editIncidentDetails(state.incident.id, data)).rejects.toThrow("cannot be reopened");
    expect(state.write).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });

  it("rejects changing resolved historical service status", async () => {
    const data = details(); data.set(`componentStatus_${state.componentId}`, "OPERATIONAL");
    await expect(editIncidentDetails(state.incident.id, data)).rejects.toThrow("locked");
    expect(state.write).not.toHaveBeenCalled();
  });

  it("rejects changing resolved scope to page-wide", async () => {
    const data = details(); data.set("pageWide", "on");
    await expect(editIncidentDetails(state.incident.id, data)).rejects.toThrow("locked");
    expect(state.write).not.toHaveBeenCalled();
  });

  it("rejects a stale details form before editing an unseen latest update", async () => {
    const data = details(); data.set("latestUpdateId", "old-update");
    await expect(editIncidentDetails(state.incident.id, data)).rejects.toThrow("Reload before editing");
    expect(state.write).not.toHaveBeenCalled();
  });

  it("rejects reopening through the latest timeline entry", async () => {
    const data = new FormData(); data.set("status", "MONITORING"); data.set("body", "Correction");
    await expect(editIncidentUpdate(state.incident.id, state.updateId, data)).rejects.toThrow("locked");
    expect(state.write).not.toHaveBeenCalled();
  });

  it("rejects appending an update to a resolved incident through the shared API domain", async () => {
    await expect(addIncidentUpdate("org", state.incident.id, { status: "INVESTIGATING", body: "New outage", notify: true })).rejects.toThrow("cannot receive new updates");
    expect(state.write).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });
});


describe("resolved correction safeguards", () => {
  it("rejects overwriting a concurrent correction to the same timeline entry", async () => {
    state.latestEditedAt = new Date("2026-10-15T00:00:00Z");
    await expect(editIncidentDetails(state.incident.id, details())).rejects.toThrow("another operator");
    const data = new FormData(); data.set("status", "RESOLVED"); data.set("body", "My correction");
    await expect(editIncidentUpdate(state.incident.id, state.updateId, data)).rejects.toThrow("another operator");
    expect(state.write).not.toHaveBeenCalled();
  });
  it.each([
    ["impact", "NONE", "impact"],
    ["backfilled", "on", "Backfill"],
    ["notify", "on", "notifications"],
  ])("rejects changing %s through a direct request", async (field, value, message) => {
    const data = details(); data.set(field, value);
    await expect(editIncidentDetails(state.incident.id, data)).rejects.toThrow(message);
    expect(state.write).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });
  it("does not mark an unchanged correction as edited", async () => {
    state.latestBody = "Payments have recovered.";
    await editIncidentDetails(state.incident.id, details());
    expect(state.write).not.toHaveBeenCalled();
    expect(state.reconcile).not.toHaveBeenCalled();
  });
  it("allows correcting history even after all affected service links have been deleted", async () => {
    state.links = [];
    const data = details(); data.delete("componentIds");
    await expect(editIncidentDetails(state.incident.id, data)).resolves.toBeUndefined();
    expect(state.write).not.toHaveBeenCalledWith("incidentComponents");
    expect(state.reconcile).not.toHaveBeenCalled();
  });
});


describe("hidden incident notification protection", () => {
  it("records a hidden active incident update without subscriber delivery", async () => {
    state.incident.status = "INVESTIGATING"; state.incident.publicVisible = false;
    const result = await addIncidentUpdate("org", state.incident.id, { status: "IDENTIFIED", body: "Internal investigation continues.", notify: true });
    expect(result.notify).toBe(false);
    expect(state.inserted).toHaveBeenCalledWith(expect.objectContaining({ notified: false }));
    expect(state.notify).not.toHaveBeenCalled();
  });
});
