import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IncidentCard, PastIncidentsByDay, type IncidentRow } from "../components/public/IncidentTimeline";

describe("past incident timeline", () => {
  const pastIncident = (index: number): IncidentRow => ({
    id: `past-${index}`, name: `Incident number ${index}`, status: "RESOLVED", impact: "MINOR", isMaintenance: false,
    maintenanceStatus: null, scheduledStart: null, scheduledEnd: null,
    createdAt: new Date(new Date().getTime() - (42 - index) * 86_400_000), resolvedAt: new Date(new Date().getTime() - (42 - index) * 86_400_000 + 3_600_000),
    postmortemPublishedAt: new Date(), postmortemBody: "Recovery review", updates: [], components: [],
  });

  it("shows the ten newest incidents even when they are older than the former date window", () => {
    const html = renderToStaticMarkup(<PastIncidentsByDay incidents={Array.from({ length: 13 }, (_, index) => pastIncident(index))} pageSlug="demo" />);
    expect(html.match(/Incident number /g)).toHaveLength(10);
    expect(html).toContain("Incident number 12");
    expect(html).not.toContain("Incident number 2<");
    expect(html.indexOf("Incident number 12")).toBeLessThan(html.indexOf("Incident number 3<"));
  });

  it("links to the postmortem from summaries without linking the detail page back to itself", () => {
    const incident = pastIncident(0);
    expect(renderToStaticMarkup(<IncidentCard incident={incident} pageSlug="demo" />)).toContain("Read postmortem");
    expect(renderToStaticMarkup(<IncidentCard incident={incident} pageSlug="demo" linkPermalink={false} />)).not.toContain("Read postmortem");
  });
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

  it("marks a corrected public update with a small accessible edited icon", () => {
    const now = new Date("2026-07-25T03:00:00Z");
    const incident: IncidentRow = {
      id: "edited-incident", name: "API outage", status: "MONITORING", impact: "MAJOR",
      isMaintenance: false, maintenanceStatus: null, scheduledStart: null, scheduledEnd: null,
      createdAt: now, resolvedAt: null, postmortemPublishedAt: null, components: [],
      updates: [{ id: "edited-update", status: "MONITORING", body: "Corrected message", createdAt: now, editedAt: now }],
    };
    const html = renderToStaticMarkup(<IncidentCard incident={incident} pageSlug="demo" linkPermalink={false} />);
    expect(html).toContain('aria-label="Edited');
    expect(html).toContain('class="lucide lucide-info');
    expect(html).toContain("Corrected message");
  });
});
