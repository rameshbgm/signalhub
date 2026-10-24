import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "ADMIN", publicVisible: true }));
vi.mock("@/lib/require-session", () => ({ requireSession: async () => ({ session: { role: state.role }, org: { id: "org" } }) }));
vi.mock("@/lib/admin-guard", async () => {
  const { hasCapability } = await import("@/lib/identity");
  return { assertPageInOrg: vi.fn(), sessionHasCapability: (session: { role: string }, capability: Parameters<typeof hasCapability>[1]) => hasCapability(session.role, capability) };
});
vi.mock("@/lib/postgres/client", () => ({
  database: { selectFrom(table: string) {
    const incident = { id: "11111111-1111-4111-8111-111111111111", pageId: "22222222-2222-4222-8222-222222222222", name: "Payment outage", status: "RESOLVED", impact: "MAJOR", pageWide: true, backfilled: false, isMaintenance: false, publicVisible: state.publicVisible, postmortemBody: null, postmortemPublishedAt: null, createdAt: new Date(), resolvedAt: new Date() };
    const page = { id: incident.pageId, name: "Payments", orgId: "org" };
    let rows: Array<Record<string, unknown>> = table === "pages" ? [page] : table === "incidents" ? [incident] : table === "incidentUpdates" ? [{ id: "update", incidentId: incident.id, status: "RESOLVED", body: "Recovered", createdAt: new Date(), editedAt: null, notified: false }] : [];
    const query = { select() { return query; }, selectAll() { return query; }, orderBy() { return query; },
      where(column: unknown, operator?: string, value?: unknown) { if (typeof column === "string") rows = rows.filter((row) => operator === "!=" ? row[column] !== value : row[column] === value); return query; },
      execute: async () => rows, executeTakeFirst: async () => rows[0],
    };
    return query;
  } },
}));
vi.mock("@/app/admin/(protected)/incidents/actions", () => ({ editIncidentDetails: vi.fn(), editIncidentUpdate: vi.fn(), postIncidentUpdate: vi.fn(), setIncidentPublicVisibility: vi.fn(), savePostmortem: vi.fn() }));
vi.mock("@/app/admin/(protected)/maintenance/actions", () => ({ deleteMaintenance: vi.fn(), setMaintenanceStatus: vi.fn() }));
vi.mock("@/components/platform/PlatformActionForm", () => ({ PlatformActionForm: ({ children }: { children: ReactNode }) => <form>{children}</form> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("Not found"); } }));

import { EventDetail } from "@/components/admin/EventDetail";

beforeEach(() => { state.role = "ADMIN"; state.publicVisible = true; });

async function markup() { return renderToStaticMarkup(await EventDetail({ incidentId: "11111111-1111-4111-8111-111111111111" })); }

describe("incident visibility controls", () => {
  it.each(["ADMIN", "INCIDENT_MANAGER"])("offers %s a hide control and no incident deletion", async (role) => {
    state.role = role;
    const html = await markup();
    expect(html).toContain("Hide from public page");
    expect(html).not.toContain("Delete incident");
    expect(html).not.toContain("Danger zone");
  });
  it.each(["RESPONDER", "VIEWER"])("shows %s visibility without a hide/restore button", async (role) => {
    state.role = role;
    const html = await markup();
    expect(html).toContain("Only Admins and Incident Managers");
    expect(html).not.toContain("Hide from public page");
    expect(html).not.toContain("Unhide from public page");
  });
  it("shows hidden state and offers restoration to incident managers", async () => {
    state.role = "INCIDENT_MANAGER"; state.publicVisible = false;
    const html = await markup();
    expect(html).toContain("Hidden from public page");
    expect(html).toContain("Unhide from public page");
    expect(html).toContain("Its full history remains in the console");
  });
});
