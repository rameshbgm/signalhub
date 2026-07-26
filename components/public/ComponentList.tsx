"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Card,
  Input,
} from "@fluentui/react-components";
import {
  COMPONENT_STATUS_COLOR,
  COMPONENT_STATUS_LABEL,
  type ComponentStatus,
  computeDailyUptime,
  weightedUptime,
} from "@/lib/status";
import { UptimeBar } from "@/components/public/UptimeBar";
import type { UptimeBarSize, UptimeBarStyle, UptimeIconStyle } from "@/lib/page-design";

type StatusEvent = { status: string; startedAt: Date; endedAt: Date | null; isMaintenance: boolean; note?: string | null };

export type ComponentRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  showUptime: boolean;
  isThirdParty: boolean;
  thirdPartyProvider: string | null;
  statusEvents: StatusEvent[];
  createdAt: Date;
};

export type GroupRow = {
  id: string;
  name: string;
  collapsed?: boolean;
  components: ComponentRow[];
};

export type ComponentListSettings = {
  view: "LIST" | "CARDS" | "GRID" | "COMPACT" | "UPTIME";
  uptimeDays: 30 | 60 | 90;
  uptimeStyle: UptimeBarStyle;
  uptimeSize: UptimeBarSize;
  uptimeIcon: UptimeIconStyle;
  groupStyle: "ACCORDION" | "SECTIONS" | "CARDS";
  groupingEnabled: boolean;
  componentStyle: "ROWS" | "PILLS";
  componentColumns: 1 | 2 | 3;
  showSummary: boolean;
  showLegend: boolean;
  showDescriptions: boolean;
  showUptime: boolean;
  searchEnabled: boolean;
};

type SummaryFilter = "ALL" | "OPERATIONAL" | "DEGRADED" | "OFFLINE" | "MAINTENANCE";

const DEFAULT_COMPONENT_SETTINGS: ComponentListSettings = {
  view: "LIST",
  uptimeDays: 90,
  uptimeStyle: "ROUNDED",
  uptimeSize: "RESPONSIVE",
  uptimeIcon: "NONE",
  groupStyle: "ACCORDION",
  groupingEnabled: false,
  componentStyle: "ROWS",
  componentColumns: 3,
  showSummary: false,
  showLegend: false,
  showDescriptions: true,
  showUptime: true,
  searchEnabled: false,
};

function statusColor(status: ComponentStatus) {
  return COMPONENT_STATUS_COLOR[status];
}

function statusMatchesFilter(status: string, filter: SummaryFilter) {
  if (filter === "ALL") return true;
  if (filter === "DEGRADED") return status === "DEGRADED_PERFORMANCE";
  if (filter === "OFFLINE") return status === "PARTIAL_OUTAGE" || status === "MAJOR_OUTAGE";
  if (filter === "MAINTENANCE") return status === "UNDER_MAINTENANCE";
  return status === "OPERATIONAL";
}

export function componentSummaryCounts(components: ComponentRow[]) {
  return components.reduce(
    (counts, component) => {
      counts.ALL += 1;
      if (component.status === "OPERATIONAL") counts.OPERATIONAL += 1;
      else if (component.status === "DEGRADED_PERFORMANCE") counts.DEGRADED += 1;
      else if (component.status === "UNDER_MAINTENANCE") counts.MAINTENANCE += 1;
      else if (component.status === "PARTIAL_OUTAGE" || component.status === "MAJOR_OUTAGE") counts.OFFLINE += 1;
      return counts;
    },
    { ALL: 0, OPERATIONAL: 0, DEGRADED: 0, OFFLINE: 0, MAINTENANCE: 0 },
  );
}

function componentUptime(c: ComponentRow, settings: ComponentListSettings, nowIso: string) {
  const days = c.showUptime && settings.showUptime
    ? computeDailyUptime(c.statusEvents, settings.uptimeDays, new Date(nowIso), c.createdAt)
    : [];
  return { days, uptimePct: weightedUptime(days) };
}

function ConfiguredComponentItem({
  c,
  settings,
  nowIso,
}: {
  c: ComponentRow;
  settings: ComponentListSettings;
  nowIso: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = c.status as ComponentStatus;
  const { days, uptimePct } = componentUptime(c, settings, nowIso);

  if (settings.componentStyle === "PILLS") {
    return (
      <Card
        data-component-row
        appearance="outline"
        className="min-w-0 !gap-0 !rounded-full !border-[var(--line)] !bg-[var(--surface)] !p-0"
      >
        <div className="flex min-h-14 min-w-0 items-center gap-3 px-4">
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm"
            style={{ borderColor: `${statusColor(status)}55`, backgroundColor: `${statusColor(status)}16`, color: statusColor(status) }}
          >
            ✓
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--fg)]">{c.name}</span>
          <Button
            appearance="subtle"
            shape="circular"
            size="small"
            aria-label={`${expanded ? "Hide" : "Show"} details for ${c.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "−" : "+"}
          </Button>
        </div>
        {expanded && (
          <div className="border-t border-[var(--line)] px-4 pb-4 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[var(--fg-dim)]">{settings.showDescriptions && c.description ? c.description : "Current service status"}</span>
              <span className="inline-flex items-center text-xs font-medium" style={{ color: statusColor(status) }}>
                <span className="status-dot rounded-full" style={{ backgroundColor: statusColor(status) }} />
                {COMPONENT_STATUS_LABEL[status]}
              </span>
            </div>
            {c.showUptime && settings.showUptime && <UptimeBar days={days} uptimePct={uptimePct} style={settings.uptimeStyle} size={settings.uptimeSize} iconStyle={settings.uptimeIcon} />}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div data-component-row className={`${settings.view === "COMPACT" ? "py-2.5" : "py-4"} min-w-0 max-w-full overflow-hidden border-b border-[var(--line)] last:border-b-0`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-[var(--fg)]">{c.name}</span>
          {c.isThirdParty && <span className="ml-2 text-xs text-[var(--fg-dim)]">via {c.thirdPartyProvider}</span>}
          {settings.showDescriptions && c.description && <p className="mt-0.5 text-xs text-[var(--fg-dim)]">{c.description}</p>}
        </div>
        <span className="inline-flex min-w-0 max-w-full shrink items-center text-right font-mono text-sm font-medium leading-snug" style={{ color: statusColor(status) }}>
          <span className="status-dot rounded-full" style={{ backgroundColor: statusColor(status) }} />
          {COMPONENT_STATUS_LABEL[status]}
        </span>
      </div>
      {c.showUptime && settings.showUptime && <UptimeBar days={days} uptimePct={uptimePct} style={settings.uptimeStyle} size={settings.uptimeSize} iconStyle={settings.uptimeIcon} />}
    </div>
  );
}

function componentGridClass(settings: ComponentListSettings) {
  if (settings.componentStyle !== "PILLS") return "divide-y divide-[var(--line)]";
  if (settings.componentColumns === 1) return "grid gap-3";
  if (settings.componentColumns === 2) return "grid gap-3 sm:grid-cols-2";
  return "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
}

export function ComponentList({
  groups,
  ungrouped,
  settings = DEFAULT_COMPONENT_SETTINGS,
  nowIso,
}: {
  groups: GroupRow[];
  ungrouped: ComponentRow[];
  settings?: ComponentListSettings;
  nowIso: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SummaryFilter>("ALL");
  const normalized = query.trim().toLowerCase();
  const allComponents = [...groups.flatMap((group) => group.components), ...ungrouped];
  const counts = componentSummaryCounts(allComponents);
  const filterComponents = (components: ComponentRow[]) =>
    components.filter((component) => {
      const matchesQuery = !normalized || `${component.name} ${component.description}`.toLowerCase().includes(normalized);
      return matchesQuery && statusMatchesFilter(component.status, statusFilter);
    });
  const visibleGroups = groups
    .map((group) => ({ ...group, components: filterComponents(group.components) }))
    .filter((group) => group.components.length > 0);
  const visibleUngrouped = filterComponents(ungrouped);
  const groupingEnabled = settings.groupingEnabled || visibleGroups.length > 0;
  const configuredGroups = groupingEnabled
    ? [
        ...visibleGroups,
        ...(visibleUngrouped.length
          ? [{ id: "ungrouped", name: groups.length ? "Other services" : "Services", collapsed: false, components: visibleUngrouped }]
          : []),
      ]
    : [];
  const flatComponents = groupingEnabled
    ? []
    : [...visibleGroups.flatMap((group) => group.components), ...visibleUngrouped];
  const summaryItems: Array<{ value: SummaryFilter; label: string; color: string }> = [
    { value: "ALL", label: "Total Services", color: "var(--page-brand)" },
    { value: "OPERATIONAL", label: "Operational", color: COMPONENT_STATUS_COLOR.OPERATIONAL },
    { value: "DEGRADED", label: "Degraded", color: COMPONENT_STATUS_COLOR.DEGRADED_PERFORMANCE },
    { value: "OFFLINE", label: "Offline", color: COMPONENT_STATUS_COLOR.MAJOR_OUTAGE },
    { value: "MAINTENANCE", label: "Maintenance", color: COMPONENT_STATUS_COLOR.UNDER_MAINTENANCE },
  ];
  const renderComponents = (components: ComponentRow[]) => (
    <div className={componentGridClass(settings)}>
      {components.map((component) => (
        <ConfiguredComponentItem key={component.id} c={component} settings={settings} nowIso={nowIso} />
      ))}
    </div>
  );

  return (
    <div>
      {settings.showSummary && (
        <div data-service-summary className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {summaryItems.map((item) => {
            const selected = statusFilter === item.value;
            return (
              <Button
                key={item.value}
                appearance="subtle"
                shape="square"
                aria-pressed={selected}
                onClick={() => setStatusFilter(item.value)}
                className="!h-auto !min-h-24 !w-full !rounded-[var(--page-radius)] !p-4"
                style={{
                  border: `2px solid ${selected ? item.color : "var(--line)"}`,
                  background: selected ? `color-mix(in srgb, ${item.color} 8%, var(--surface))` : "var(--surface)",
                }}
              >
                <span className="flex flex-col items-center gap-1">
                  <span className="text-sm font-medium text-[var(--fg-soft)]">{item.label}</span>
                  <span className="text-3xl font-semibold" style={{ color: item.value === "ALL" ? "var(--fg)" : item.color }}>
                    {counts[item.value]}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      )}
      {settings.searchEnabled && (
        <label className="mb-5 block">
          <span className="sr-only">Search services</span>
          <Input
            type="search"
            size="large"
            value={query}
            onChange={(_event, data) => setQuery(data.value)}
            placeholder="Search services"
            contentBefore={<span aria-hidden="true">⌕</span>}
            className="!w-full !rounded-[var(--page-radius)] !border-[var(--line)] !bg-[var(--surface)]"
          />
        </label>
      )}
      {settings.showLegend && (
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--fg-soft)]">
          {(Object.keys(COMPONENT_STATUS_LABEL) as ComponentStatus[]).map((status) => (
            <span key={status} className="inline-flex items-center">
              <span className="status-dot rounded-full" style={{ backgroundColor: statusColor(status) }} />
              {COMPONENT_STATUS_LABEL[status]}
            </span>
          ))}
        </div>
      )}
      <div data-component-list>
        {!groupingEnabled && flatComponents.length > 0 && (
          <div className="page-panel min-w-0 overflow-hidden border border-[var(--line)] bg-[var(--surface)] px-5">
            {renderComponents(flatComponents)}
          </div>
        )}
        {configuredGroups.length > 0 && settings.groupStyle === "ACCORDION" && (
          <Accordion
            multiple
            collapsible
            defaultOpenItems={configuredGroups.filter((group) => !group.collapsed).map((group) => group.id)}
            className="space-y-4"
          >
            {configuredGroups.map((group) => (
              <AccordionItem key={group.id} value={group.id} className="page-panel overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
                <AccordionHeader expandIconPosition="end" size="large" className="px-3">
                  <span className="flex w-full items-center justify-between gap-4 pr-2 text-left">
                    <span className="font-semibold text-[var(--fg)]">{group.name}</span>
                    <span className="whitespace-nowrap text-sm font-normal text-[var(--fg-dim)]">
                      {group.components.length} {group.components.length === 1 ? "service" : "services"}
                    </span>
                  </span>
                </AccordionHeader>
                <AccordionPanel className="border-t border-[var(--line)] !px-5 !pb-5 !pt-4">
                  {renderComponents(group.components)}
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        )}
        {configuredGroups.length > 0 && settings.groupStyle !== "ACCORDION" && (
          <div className={settings.groupStyle === "CARDS" ? "grid gap-4 md:grid-cols-2" : "space-y-4"}>
            {configuredGroups.map((group) => (
              <section key={group.id} className="page-panel min-w-0 overflow-hidden border border-[var(--line)] bg-[var(--surface)] p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-[var(--fg)]">{group.name}</h3>
                  <span className="text-sm text-[var(--fg-dim)]">{group.components.length} {group.components.length === 1 ? "service" : "services"}</span>
                </div>
                {renderComponents(group.components)}
              </section>
            ))}
          </div>
        )}
        {configuredGroups.length === 0 && flatComponents.length === 0 && (
          <p className="page-panel border border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-dim)]">
            No services match the selected filters.
          </p>
        )}
      </div>
    </div>
  );
}
