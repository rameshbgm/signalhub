import { describe, expect, it } from "vitest";
import { assertIncidentEditAllowed, assertTimelineEditAllowed, createIncidentInputSchema, editIncidentInputSchema } from "@/lib/incident-validation";

const componentId = "11111111-1111-4111-8111-111111111111";
const input = {
  pageId: "22222222-2222-4222-8222-222222222222",
  name: "Payment outage",
  body: "We are investigating failed payments.",
  status: "INVESTIGATING",
  impact: "MAJOR",
  notify: false,
  pageWide: false,
  backfilled: false,
  components: [{ componentId, status: "MAJOR_OUTAGE" }],
};

describe("incident details and affected service validation", () => {
  it("requires an affected service or explicit page-wide scope", () => {
    expect(createIncidentInputSchema.safeParse({ ...input, components: [] }).success).toBe(false);
    expect(createIncidentInputSchema.safeParse({ ...input, components: [], pageWide: true }).success).toBe(true);
    expect(createIncidentInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects duplicate affected services", () => {
    expect(createIncidentInputSchema.safeParse({ ...input, components: [input.components[0], input.components[0]] }).success).toBe(false);
  });

  it.each(["INVESTIGATING", "IDENTIFIED"])("rejects an %s outage with only operational services", (status) => {
    expect(createIncidentInputSchema.safeParse({ ...input, status, components: [{ componentId, status: "OPERATIONAL" }] }).success).toBe(false);
  });

  it("allows recovered services during monitoring and informational incidents with no impact", () => {
    const components = [{ componentId, status: "OPERATIONAL" }];
    expect(createIncidentInputSchema.safeParse({ ...input, status: "MONITORING", components }).success).toBe(true);
    expect(createIncidentInputSchema.safeParse({ ...input, impact: "NONE", components }).success).toBe(true);
    expect(createIncidentInputSchema.safeParse({ ...input, impact: "NONE" }).success).toBe(false);
  });

  it("requires a maintenance workflow for active maintenance status", () => {
    expect(createIncidentInputSchema.safeParse({ ...input, components: [{ componentId, status: "UNDER_MAINTENANCE" }] }).success).toBe(false);
  });

  it("requires resolved, silent backfills and retains historical affected scope", () => {
    expect(createIncidentInputSchema.safeParse({ ...input, backfilled: true }).success).toBe(false);
    expect(createIncidentInputSchema.safeParse({ ...input, backfilled: true, status: "RESOLVED", notify: true }).success).toBe(false);
    expect(createIncidentInputSchema.safeParse({ ...input, backfilled: true, status: "RESOLVED" }).success).toBe(true);
  });
});

describe("resolved incident edits", () => {
  const scope = { status: "RESOLVED", impact: "MAJOR", backfilled: false, pageWide: false, components: input.components };

  it("allows text corrections with unchanged resolved scope", () => {
    expect(() => assertIncidentEditAllowed(scope, { ...scope, components: [...scope.components] })).not.toThrow();
  });

  it.each(["INVESTIGATING", "IDENTIFIED", "MONITORING"])("rejects reopening into %s through an edit", (status) => {
    expect(() => assertIncidentEditAllowed(scope, { ...scope, status })).toThrow("cannot be reopened");
  });

  it("rejects adding/removing affected services, changing page scope, or changing their historical statuses", () => {
    expect(() => assertIncidentEditAllowed(scope, { ...scope, components: [] })).toThrow("locked");
    expect(() => assertIncidentEditAllowed(scope, { ...scope, pageWide: true })).toThrow("locked");
    expect(() => assertIncidentEditAllowed(scope, { ...scope, components: [{ componentId, status: "OPERATIONAL" }] })).toThrow("locked");
  });

  it("allows normal active scope changes and locks the existing scope when resolving", () => {
    const current = { ...scope, status: "INVESTIGATING" };
    expect(() => assertIncidentEditAllowed(current, { ...current, pageWide: true })).not.toThrow();
    expect(() => assertIncidentEditAllowed(current, scope)).not.toThrow();
    expect(() => assertIncidentEditAllowed(current, { ...scope, components: [] })).toThrow("locked");
  });
});


describe("closed incident history", () => {
  const current = { status: "RESOLVED", impact: "MAJOR", backfilled: false, pageWide: false, components: input.components };
  it("locks impact, backfill classification and incident notifications", () => {
    expect(() => assertIncidentEditAllowed(current, { ...current, impact: "NONE" })).toThrow("impact");
    expect(() => assertIncidentEditAllowed(current, { ...current, backfilled: true })).toThrow("Backfill");
    expect(() => assertIncidentEditAllowed(current, { ...current, notify: true })).toThrow("notifications");
  });
  it("does not allow an existing live incident to become a backfill", () => {
    expect(() => assertIncidentEditAllowed({ ...current, status: "MONITORING" }, { ...current, backfilled: true })).toThrow("Backfill");
  });
  it("requires new resolved incidents to be silent backfills", () => {
    expect(createIncidentInputSchema.safeParse({ ...input, status: "RESOLVED" }).success).toBe(false);
    expect(createIncidentInputSchema.safeParse({ ...input, status: "RESOLVED", backfilled: true }).success).toBe(true);
  });
  it("allows text corrections after all historical service links have been removed", () => {
    expect(editIncidentInputSchema.safeParse({ ...input, status: "RESOLVED", components: [] }).success).toBe(true);
    expect(() => assertIncidentEditAllowed({ ...current, components: [] }, { ...current, components: [] })).not.toThrow();
    expect(createIncidentInputSchema.safeParse({ ...input, status: "RESOLVED", backfilled: true, components: [] }).success).toBe(false);
  });
  it("locks every timeline status after resolution, including older updates", () => {
    expect(() => assertTimelineEditAllowed("RESOLVED", "IDENTIFIED", "MONITORING", false)).toThrow("locked");
    expect(() => assertTimelineEditAllowed("RESOLVED", "RESOLVED", "IDENTIFIED", true)).toThrow("locked");
    expect(() => assertTimelineEditAllowed("RESOLVED", "IDENTIFIED", "IDENTIFIED", false)).not.toThrow();
  });
  it("does not allow a historical edit to add or remove a resolution boundary", () => {
    expect(() => assertTimelineEditAllowed("MONITORING", "IDENTIFIED", "RESOLVED", false)).toThrow("historical");
    expect(() => assertTimelineEditAllowed("MONITORING", "RESOLVED", "IDENTIFIED", false)).toThrow("historical");
    expect(() => assertTimelineEditAllowed("MONITORING", "IDENTIFIED", "MONITORING", false)).not.toThrow();
  });
});
