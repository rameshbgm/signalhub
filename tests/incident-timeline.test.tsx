import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IncidentCard, PastIncidentsByDay, type IncidentRow } from "../components/public/IncidentTimeline";

describe("past incident timeline", () => {
  it("renders only dates that contain incidents", () => {
    const now = new Date();
    const incident: IncidentRow = {
      id: "incident-1",
      name: "API latency",
      status: "RESOLVED",
      impact: "MINOR",
      isMaintenance: false,
      maintenanceStatus: null,
      scheduledStart: null,
      scheduledEnd: null,
      createdAt: now,
      resolvedAt: now,
      postmortemPublishedAt: null,
      updates: [],
      components: [],
    };

    const html = renderToStaticMarkup(
      <PastIncidentsByDay incidents={[incident]} pageSlug="demo" days={14} timeZone="UTC" />
    );

    expect(html).toContain("API latency");
    expect(html).not.toContain("No incidents reported");
    expect(html.match(/<h4/g)).toHaveLength(1);
  });

  it("renders incident details as a newest-first rail with repeated statuses labelled as updates", () => {
    const incident: IncidentRow = {
      id: "incident-2",
      name: "Dashboard outage",
      status: "RESOLVED",
      impact: "MAJOR",
      isMaintenance: false,
      maintenanceStatus: null,
      scheduledStart: null,
      scheduledEnd: null,
      createdAt: new Date("2026-07-25T00:00:00Z"),
      resolvedAt: new Date("2026-07-25T03:00:00Z"),
      postmortemPublishedAt: null,
      updates: [
        { id: "one", status: "INVESTIGATING", body: "Investigating", createdAt: new Date("2026-07-25T01:00:00Z") },
        { id: "two", status: "INVESTIGATING", body: "More details", createdAt: new Date("2026-07-25T02:00:00Z") },
        { id: "three", status: "RESOLVED", body: "Resolved", createdAt: new Date("2026-07-25T03:00:00Z") },
      ],
      components: [],
    };

    const html = renderToStaticMarkup(
      <IncidentCard incident={incident} pageSlug="demo" linkPermalink={false} timeZone="UTC" />
    );

    expect(html).toContain('data-incident-timeline="detailed"');
    expect(html.indexOf("Resolved")).toBeLessThan(html.indexOf("Updated"));
    expect(html.indexOf("Updated")).toBeLessThan(html.lastIndexOf("Investigating"));
    expect(html).toContain("rounded-full");
  });
});
