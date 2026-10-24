import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ComponentList,
  componentSummaryCounts,
  groupDailyUptime,
  type ComponentListSettings,
  type ComponentRow,
} from "../components/public/ComponentList";

const createdAt = new Date("2026-07-01T00:00:00.000Z");

function component(id: string, name: string, status: string): ComponentRow {
  return {
    id,
    name,
    status,
    description: `${name} description`,
    showUptime: false,
    isThirdParty: false,
    thirdPartyProvider: null,
    statusEvents: [],
    createdAt,
  };
}

const components = [
  component("one", "Authoritative DNS", "OPERATIONAL"),
  component("two", "Recursive DNS", "DEGRADED_PERFORMANCE"),
  component("three", "Edge Network", "MAJOR_OUTAGE"),
  component("four", "Dashboard", "UNDER_MAINTENANCE"),
];

const settings: ComponentListSettings = {
  view: "LIST",
  uptimeDays: 90,
  uptimeStyle: "ROUNDED",
  uptimeSize: "RESPONSIVE",
  uptimeIcon: "NONE",
  groupStyle: "ACCORDION",
  groupDefaultView: "COLLAPSED",
  groupingEnabled: true,
  componentStyle: "PILLS",
  componentColumns: 3,
  showSummary: true,
  showLegend: false,
  showDescriptions: true,
  showUptime: false,
  searchEnabled: true,
};

describe("component directory customization", () => {
  it("groups statuses into the public summary categories", () => {
    expect(componentSummaryCounts(components)).toEqual({
      ALL: 4,
      OPERATIONAL: 1,
      DEGRADED: 1,
      OFFLINE: 1,
      MAINTENANCE: 1,
    });
  });

  it("renders summary filters and search with service groups collapsed by default", () => {
    const html = renderToStaticMarkup(
      <ComponentList
        groups={[{ id: "dns", name: "DNS", collapsed: false, components: components.slice(0, 2) }]}
        ungrouped={components.slice(2)}
        settings={settings}
        nowIso="2026-07-26T00:00:00.000Z"
      />,
    );

    expect(html).toContain("data-service-summary");
    expect(html).toContain("Total Services");
    expect(html).toContain("Search services");
    expect(html).toContain("DNS");
    expect(html).toContain("2 services");
    expect(html).not.toContain("data-component-row");
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html).toContain("<input");
    expect(html).toContain("inline-flex");
  });

  it("keeps saved component groups visible when customization is otherwise disabled", () => {
    const html = renderToStaticMarkup(
      <ComponentList
        groups={[{ id: "dns", name: "DNS", collapsed: false, components: components.slice(0, 2) }]}
        ungrouped={components.slice(2)}
        settings={{
          ...settings,
          groupingEnabled: false,
          componentStyle: "ROWS",
          showSummary: false,
          searchEnabled: false,
        }}
        nowIso="2026-07-26T00:00:00.000Z"
      />,
    );

    expect(html).not.toContain("data-component-row");
    expect(html).not.toContain("data-service-summary");
    expect(html).not.toContain("Search services");
    expect(html).toContain("aria-expanded");
    expect(html).toContain("DNS");
    expect(html).toContain("Other services");
    expect(html).not.toContain("Show details for Authoritative DNS");
  });

  it("opens every service group when the page is configured as expanded", () => {
    const html = renderToStaticMarkup(
      <ComponentList
        groups={[{ id: "dns", name: "DNS", collapsed: true, components: components.slice(0, 2) }]}
        ungrouped={components.slice(2)}
        settings={{ ...settings, groupDefaultView: "EXPANDED" }}
        nowIso="2026-07-26T00:00:00.000Z"
      />,
    );

    expect(html.match(/aria-expanded="true"/g)).toHaveLength(2);
    expect(html).toContain("Authoritative DNS");
    expect(html).toContain("Show details for Authoritative DNS");
    expect(html).toContain("Edge Network");
    expect(html).not.toContain("data-group-uptime");
  });

  it("averages observed service uptime without hiding an outage or inventing historical data", () => {
    const healthy = { ...components[0], showUptime: true };
    const newService = {
      ...components[2],
      showUptime: true,
      createdAt: new Date("2026-07-26T06:00:00.000Z"),
      statusEvents: [{ status: "MAJOR_OUTAGE", startedAt: new Date("2026-07-26T06:00:00.000Z"), endedAt: null, isMaintenance: false }],
    };
    const uptimeSettings = { ...settings, showUptime: true };
    const nowIso = "2026-07-26T12:00:00.000Z";
    const days = groupDailyUptime([healthy, newService], uptimeSettings, nowIso);

    expect(days[0].uptimePct).toBeNull();
    expect(days.at(-2)?.uptimePct).toBe(100);
    expect(days.at(-1)?.uptimePct).toBeCloseTo(100 * 12 / 18);
    expect(days.at(-1)?.status).toBe("MAJOR_OUTAGE");
    expect(groupDailyUptime([newService], uptimeSettings, nowIso).at(-2)?.uptimePct).toBeNull();
    expect(groupDailyUptime([healthy], settings, nowIso)).toEqual([]);

    const html = renderToStaticMarkup(
      <ComponentList groups={[{ id: "core", name: "Core", components: [healthy, newService] }]} ungrouped={[]} settings={uptimeSettings} nowIso={nowIso} />,
    );
    expect(html).toContain("data-group-uptime");
    expect(html).toContain("avg. uptime");
    expect(html).toContain("rounded-full");
    expect(html).toContain("#dc2626");
    expect(html).not.toContain("data-component-row");
  });
});
