import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ComponentList,
  componentSummaryCounts,
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

  it("renders Fluent summary filters, search, accordion groups, and pill services", () => {
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
    expect(html).toContain("Authoritative DNS");
    expect(html).toContain("sm:grid-cols-2 lg:grid-cols-3");
    expect(html).toContain("Show details for Authoritative DNS");
    expect(html).toContain("fui-Accordion");
    expect(html).toContain("fui-Input");
    expect(html).toContain("fui-Button");
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

    expect(html).toContain("Authoritative DNS");
    expect(html).toContain("Edge Network");
    expect(html).not.toContain("data-service-summary");
    expect(html).not.toContain("Search services");
    expect(html).toContain("fui-Accordion");
    expect(html).toContain("DNS");
    expect(html).toContain("Other services");
    expect(html).not.toContain("Show details for Authoritative DNS");
  });
});
