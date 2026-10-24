import { describe, expect, it } from "vitest";
import { renderStatusBadge } from "../lib/badge";
import { publicPagePath } from "../lib/public-path";
import {
  activeIncidentIndicator,
  canNotifyHubSubscribersFromChild,
} from "../lib/public-surface-policy";

describe("hub and public surface helpers", () => {
  it("uses the canonical hub route", () => {
    expect(publicPagePath({ slug: "cloud", isHub: true })).toBe("/hub/cloud");
    expect(publicPagePath({ slug: "api / edge", isHub: false })).toBe(
      "/api%20%2F%20edge"
    );
  });

  it("does not inherit protected child access for hub notifications", () => {
    expect(
      canNotifyHubSubscribersFromChild({ type: "PUBLIC", isHub: false })
    ).toBe(true);
    expect(
      canNotifyHubSubscribersFromChild({ type: "PRIVATE", isHub: false })
    ).toBe(false);
    expect(
      canNotifyHubSubscribersFromChild({ type: "AUDIENCE", isHub: false })
    ).toBe(false);
  });

  it("derives current status from active incidents and maintenance", () => {
    expect(
      activeIncidentIndicator({
        impact: "CRITICAL",
        isMaintenance: false,
        maintenanceStatus: null,
        status: "INVESTIGATING",
      })
    ).toBe("MAJOR_OUTAGE");
    expect(
      activeIncidentIndicator({
        impact: "NONE",
        isMaintenance: true,
        maintenanceStatus: "IN_PROGRESS",
        status: "INVESTIGATING",
      })
    ).toBe("UNDER_MAINTENANCE");
    expect(
      activeIncidentIndicator({
        impact: "NONE",
        isMaintenance: true,
        maintenanceStatus: "SCHEDULED",
        status: "INVESTIGATING",
      })
    ).toBeNull();
  });

  it("escapes dynamic badge labels", () => {
    const badge = renderStatusBadge('Major <Outage> & "delay"', "#dc2626");
    expect(badge).toContain("Major &lt;Outage&gt; &amp; &quot;delay&quot;");
    expect(badge).not.toContain("<Outage>");
    expect(badge).toContain('fill="#dc2626"');
  });
});
