import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronRight, Plus, Wrench } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { MAINTENANCE_STATUS_LABEL, type MaintenanceStatus } from "@/lib/status";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { maintenanceStatusTone } from "@/components/admin/operate-ui";

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
  const scheduleLink = (
    <Link href="/organization/maintenance/new" className={buttonVariants()}>
      <Plus aria-hidden size={16} />
      Schedule maintenance
    </Link>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Scheduled maintenance"
        icon={Wrench}
        hue="amber"
        description="Announce planned work ahead of time so subscribers are not surprised by downtime."
        actions={canSchedule && maintenance.length > 0 ? scheduleLink : undefined}
      />

      {maintenance.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          hue="amber"
          title="No maintenance scheduled"
          description="Schedule a window and your status page shows it ahead of time. Planned work you schedule appears here."
          action={canSchedule ? scheduleLink : undefined}
          className="py-20"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Maintenance windows</CardTitle>
            <CardDescription>Ordered by start time, latest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {maintenance.map((m) => {
                const status = (m.maintenanceStatus as MaintenanceStatus) ?? "SCHEDULED";
                return (
                  <li key={m.id}>
                    <Link
                      href={`/organization/incidents/${m.id}`}
                      className="group flex flex-col gap-2 rounded-control border border-line px-3.5 py-3 text-sm outline-none transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-raised focus-visible:ring-4 focus-visible:ring-primary/25 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{m.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-dim">
                          <span>{pageNameById[m.pageId]}</span>
                          {m.scheduledStart && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <CalendarClock aria-hidden size={13} />
                                {new Date(m.scheduledStart).toLocaleString()}
                                <ArrowRight aria-hidden size={13} />
                                {m.scheduledEnd ? new Date(m.scheduledEnd).toLocaleString() : "TBD"}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge tone={maintenanceStatusTone(status)}>{MAINTENANCE_STATUS_LABEL[status]}</StatusBadge>
                        <ChevronRight aria-hidden size={16} className="hidden text-ink-dim transition-transform duration-200 ease-spring group-hover:translate-x-0.5 sm:block" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
