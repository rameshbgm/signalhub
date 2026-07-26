import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { scopedPageFilter } from "@/lib/admin-guard";
import { sessionHasCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";
import {
  COMPONENT_STATUS_COLOR,
  COMPONENT_STATUS_LABEL,
  overallBanner,
  pageHealthStatus,
  worstStatus,
  type ComponentStatus,
  type PageHealthSignals,
} from "@/lib/status";

export default async function AdminDashboard() {
  const { session, org } = await requireSession();

  const pages = (await collections.pages().find(scopedPageFilter(session, org.id)).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageIds = pages.map((p) => oid(p.id));

  const [
    openIncidentDocs,
    subscriberCount,
    componentDocs,
    upcomingMaintenance,
    activeMaintenanceDocs,
    monitorDocs,
  ] = await Promise.all([
    collections
      .incidents()
      .find({ pageId: { $in: pageIds }, isMaintenance: false, status: { $ne: "RESOLVED" } })
      .sort({ createdAt: -1 })
      .toArray(),
    collections.subscribers().countDocuments({ pageId: { $in: pageIds } }),
    collections.components().find({ pageId: { $in: pageIds } }).toArray(),
    collections.incidents().countDocuments({ pageId: { $in: pageIds }, isMaintenance: true, maintenanceStatus: "SCHEDULED" }),
    collections
      .incidents()
      .find({
        pageId: { $in: pageIds },
        isMaintenance: true,
        maintenanceStatus: { $in: ["IN_PROGRESS", "VERIFYING"] },
      })
      .toArray(),
    collections.monitors().find({ pageId: { $in: pageIds }, enabled: true }).toArray(),
  ]);
  const openIncidents = openIncidentDocs.map(toId);

  const signalsByPage = new Map<string, PageHealthSignals>(
    pages.map((page) => [
      page.id,
      {
        componentStatuses: [],
        activeIncidentImpacts: [],
        maintenanceActive: false,
        downMonitorStatuses: [],
        hasHealthyMonitor: false,
      },
    ])
  );
  for (const component of componentDocs) {
    signalsByPage.get(component.pageId.toHexString())?.componentStatuses.push(component.status);
  }
  for (const incident of openIncidentDocs) {
    signalsByPage.get(incident.pageId.toHexString())?.activeIncidentImpacts.push(incident.impact);
  }
  for (const maintenance of activeMaintenanceDocs) {
    const signals = signalsByPage.get(maintenance.pageId.toHexString());
    if (signals) signals.maintenanceActive = true;
  }
  for (const monitor of monitorDocs) {
    const signals = signalsByPage.get(monitor.pageId.toHexString());
    if (!signals) continue;
    if (monitor.isDown) signals.downMonitorStatuses.push(monitor.downStatus);
    else if (monitor.lastOk === true) signals.hasHealthyMonitor = true;
  }

  const pageHealthById = new Map(
    pages.map((page) => [page.id, pageHealthStatus(signalsByPage.get(page.id)!)])
  );
  for (const hub of pages.filter((page) => page.isHub)) {
    const childStatuses = pages
      .filter((page) => page.hubParentId === hub.id)
      .map((page) => pageHealthById.get(page.id))
      .filter((status): status is ComponentStatus => status !== null && status !== undefined);
    const directStatus = pageHealthById.get(hub.id);
    const statuses = directStatus ? [directStatus, ...childStatuses] : childStatuses;
    pageHealthById.set(hub.id, statuses.length ? worstStatus(statuses) : null);
  }

  const knownPageStatuses = pages
    .map((page) => pageHealthById.get(page.id))
    .filter((status): status is ComponentStatus => status !== null && status !== undefined);
  const hasUnknownPage = knownPageStatuses.length !== pages.length;
  const worstKnownStatus = knownPageStatuses.length ? worstStatus(knownPageStatuses) : null;
  const overallHealth =
    worstKnownStatus && worstKnownStatus !== "OPERATIONAL"
      ? worstKnownStatus
      : hasUnknownPage
        ? null
        : worstKnownStatus;
  const healthBanner = overallHealth ? overallBanner([overallHealth]) : null;
  const canConfigurePages = sessionHasCapability(session, "page.configure");

  return (
    <div>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-[var(--fg)]">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--fg-soft)]">Everything happening across {org.name}, at a glance.</p>
        </div>
        <div
          className={`flex w-fit items-center gap-2 border px-3.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-wide ${
            overallHealth === "OPERATIONAL"
              ? "border-[var(--green)]/20 bg-[var(--green-soft)] text-[var(--green)]"
              : overallHealth
                ? "border-[var(--amber)]/20 bg-[var(--amber-soft)] text-[var(--amber)]"
                : "border-[var(--line-bright)] bg-[var(--surface)] text-[var(--fg-soft)]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              overallHealth === "OPERATIONAL"
                ? "bg-[var(--green)] pulse-dot"
                : overallHealth
                  ? "bg-[var(--amber)]"
                  : "bg-[var(--fg-dim)]"
            }`}
            style={
              overallHealth === "OPERATIONAL"
                ? ({ "--pulse-color": "var(--green)" } as React.CSSProperties)
                : undefined
            }
          />
          {healthBanner?.label ?? "Health data unavailable"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-10 sm:grid-cols-4">
        <StatCard label="Pages" value={pages.length} />
        <StatCard label="Components" value={componentDocs.length} />
        <StatCard label="Subscribers" value={subscriberCount} />
        <StatCard label="Upcoming Maintenance" value={upcomingMaintenance} />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div>
          <h2 className="font-mono text-base font-semibold text-[var(--fg)] mb-3">Open Incidents</h2>
          {openIncidents.length === 0 ? (
            <div className="border border-dashed border-[var(--line)] p-6 text-center">
              <p className="text-sm text-[var(--fg-soft)]">No open incidents. All clear.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {openIncidents.map((inc) => (
                <Link
                  key={inc.id}
                  href={`/organization/incidents/${inc.id}`}
                  className="flex items-center justify-between border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm transition-colors hover:border-[var(--line-bright)]"
                >
                  <span className="font-medium text-[var(--fg)]">{inc.name}</span>
                  <span className="bg-[var(--amber-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--amber)]">{inc.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-mono text-base font-semibold text-[var(--fg)] mb-3">Your Pages</h2>
          <div className="space-y-2">
            {pages.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-[var(--line)] bg-[var(--surface)] p-3.5 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    role="img"
                    aria-label={
                      pageHealthById.get(p.id)
                        ? COMPONENT_STATUS_LABEL[pageHealthById.get(p.id)!]
                        : "Health data unavailable"
                    }
                    title={
                      pageHealthById.get(p.id)
                        ? COMPONENT_STATUS_LABEL[pageHealthById.get(p.id)!]
                        : "Health data unavailable"
                    }
                    style={{
                      backgroundColor: pageHealthById.get(p.id)
                        ? COMPONENT_STATUS_COLOR[pageHealthById.get(p.id)!]
                        : "var(--fg-dim)",
                    }}
                  />
                  <div className="min-w-0">
                    <span className="font-medium text-[var(--fg)]">{p.name}</span>
                    <span className="text-xs text-[var(--fg-dim)] ml-2">
                      {p.type}
                      {p.isHub ? " · hub" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-semibold">
                  <a href={publicPagePath(p)} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center justify-center border border-transparent px-2.5 py-1 text-[var(--fg-soft)] hover:border-[var(--line)] hover:text-[var(--fg)]">
                    View
                  </a>
                  {canConfigurePages && <Link
                    href={`/organization/pages/${p.id}`}
                    className="inline-flex min-h-8 items-center justify-center border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]"
                  >
                    Manage
                  </Link>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="font-mono text-3xl font-semibold text-[var(--fg)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--fg-dim)]">{label}</p>
    </div>
  );
}
