import { describe, expect, it } from "vitest";
import { hasCapability, roleCapabilities } from "../lib/identity";

describe("organization roles", () => {
  it("keeps read-only viewers out of mutation capabilities", () => {
    expect(roleCapabilities("VIEWER")).toEqual(["analytics.view", "audit.view"]);
    expect(hasCapability("VIEWER", "incident.update")).toBe(false);
    expect(hasCapability("VIEWER", "page.configure")).toBe(false);
  });

  it("separates incident leadership from responder operations", () => {
    expect(hasCapability("INCIDENT_MANAGER", "incident.manage")).toBe(true);
    expect(hasCapability("INCIDENT_MANAGER", "subscriber.manage")).toBe(true);
    expect(hasCapability("INCIDENT_MANAGER", "monitor.manage")).toBe(false);
    expect(hasCapability("RESPONDER", "incident.manage")).toBe(false);
    expect(hasCapability("RESPONDER", "monitor.manage")).toBe(true);
  });

  it("keeps permanent purge outside tenant roles", () => {
    expect(hasCapability("ADMIN", "organization.manage")).toBe(true);
    expect(hasCapability("OWNER", "organization.manage")).toBe(true);
    expect(roleCapabilities("OWNER")).not.toContain("organization.delete");
  });
});
