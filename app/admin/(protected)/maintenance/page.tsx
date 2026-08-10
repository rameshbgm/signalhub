import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { MAINTENANCE_STATUS_LABEL, type MaintenanceStatus } from "@/lib/status";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";

export default async function MaintenanceListPage() {
  const { session, org } = await requireSession();
  const pages = await getScopedPages(session, org.id);
  const pageIds = pages.map((p) => p.id);
  const pageNameById = Object.fromEntries(pages.map((p) => [p.id, p.name]));
  const canSchedule = sessionHasCapability(session, "incident.manage");

  const maintenance = pageIds.length
    ? await database.selectFrom("incidents").selectAll().where("pageId", "in", pageIds)
      .where("isMaintenance", "=", true).orderBy("scheduledStart", "desc").execute()
    : [];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">Scheduled Maintenance</h1>
        {canSchedule && <Link
          href="/organization/maintenance/new"
          className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-mono font-semibold text-center"
        >
          Schedule Maintenance
        </Link>}
      </div>
      <div className="space-y-2">
        {maintenance.map((m) => (
          <Link
            key={m.id}
            href={`/organization/incidents/${m.id}`}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border border-[var(--line)] bg-[var(--surface)] p-3 text-sm hover:border-[var(--line-bright)]"
          >
            <div>
              <span className="font-medium text-[var(--fg)]">{m.name}</span>
              <span className="text-xs text-[var(--fg-dim)] ml-2">{pageNameById[m.pageId]}</span>
              {m.scheduledStart && (
                <span className="text-xs text-[var(--fg-dim)] ml-2">
                  {new Date(m.scheduledStart).toLocaleString()} → {m.scheduledEnd ? new Date(m.scheduledEnd).toLocaleString() : "TBD"}
                </span>
              )}
            </div>
            <span className="text-[10px] uppercase tracking-wide font-semibold bg-[var(--blue-soft)] text-[var(--blue)] px-1.5 py-0.5 self-start sm:self-auto">
              {MAINTENANCE_STATUS_LABEL[(m.maintenanceStatus as MaintenanceStatus) ?? "SCHEDULED"]}
            </span>
          </Link>
        ))}
        {maintenance.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No maintenance scheduled.</p>}
      </div>
    </div>
  );
}
