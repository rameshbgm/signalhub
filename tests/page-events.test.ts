import { describe, expect, it } from "vitest";
import { isActivePath } from "@/components/admin/AdminNav";
import { eventHref, eventsHref, groupPageEvents } from "@/lib/page-events";

const at = (day: number) => new Date(Date.UTC(2026, 9, day));
const incident = (id: string, status: string, day: number) => ({ id, isMaintenance: false, status, maintenanceStatus: null, scheduledStart: null, createdAt: at(day) });
const maintenance = (id: string, maintenanceStatus: string | null, startDay: number) => ({ id, isMaintenance: true, status: "INVESTIGATING", maintenanceStatus, scheduledStart: at(startDay), createdAt: at(1) });

describe("groupPageEvents", () => {
  it("splits events by urgency and orders each group", () => {
    const { active, upcoming, history } = groupPageEvents([
      incident("old-open", "IDENTIFIED", 2),
      incident("new-open", "INVESTIGATING", 5),
      incident("resolved", "RESOLVED", 4),
      maintenance("running", "IN_PROGRESS", 3),
      maintenance("verifying", "VERIFYING", 6),
      maintenance("later", "SCHEDULED", 20),
      maintenance("soon", null, 10),
      maintenance("done", "COMPLETED", 8),
    ]);
    expect(active.map((e) => e.id)).toEqual(["verifying", "new-open", "running", "old-open"]);
    expect(upcoming.map((e) => e.id)).toEqual(["soon", "later"]);
    expect(history.map((e) => e.id)).toEqual(["done", "resolved"]);
  });

  it("links both kinds to the Events detail route", () => {
    expect(eventHref({ id: "a" })).toBe("/organization/events/a");
  });
});

describe("isActivePath", () => {
  it("highlights Events for incident and maintenance screens", () => {
    expect(isActivePath("/organization/incidents/a", "/organization/events")).toBe(true);
    expect(isActivePath("/organization/maintenance/new", "/organization/events")).toBe(true);
    expect(isActivePath("/organization/maintenance-windows", "/organization/events")).toBe(false);
    expect(isActivePath("/organization/pages/x/events", "/organization/events")).toBe(false);
  });
});

describe("eventsHref", () => {
  it("keeps only the filters that narrow the inbox", () => {
    expect(eventsHref({})).toBe("/organization/events");
    expect(eventsHref({ kind: "all", historyPage: 1 })).toBe("/organization/events");
    expect(eventsHref({ pageId: "p", kind: "maintenance", historyPage: 3 })).toBe("/organization/events?pageId=p&show=maintenance&history=3");
  });
});
