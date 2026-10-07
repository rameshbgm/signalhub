import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronRight, Plus, Wrench } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { MAINTENANCE_STATUS_LABEL, type MaintenanceStatus } from "@/lib/status";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { PageSelect } from "@/components/admin/PageSelect";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { maintenanceStatusTone } from "@/components/admin/operate-ui";

export default async function MaintenanceListPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  const pages = await getScopedPages(session, org.id);
  const { pageId: pageFilter } = await searchParams;
  const filteredPage = pages.find((p) => p.id === pageFilter);
  const pageIds = filteredPage ? [filteredPage.id] : pages.map((p) => p.id);
  // Each event's home is its page; roles without page management stay in this list, filtered.
  const pageHref = (id: string) => sessionHasCapability(session, "page.configure") ? `/organization/pages/${id}/events` : `/organization/maintenance?pageId=${id}`;
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
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pages.length > 1 && <div className="w-56"><PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/maintenance" selected={filteredPage?.id} allLabel="All pages" /></div>}
            {canSchedule && maintenance.length > 0 && scheduleLink}
          </div>
        }
      />

      {maintenance.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          hue="amber"
          title={filteredPage ? `No maintenance on ${filteredPage.name}` : "No maintenance scheduled"}
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
                    {/* The title link covers the row; the page link sits above it, so no anchors nest. */}
                    <div className="group relative flex flex-col gap-2 rounded-control border border-line px-3.5 py-3 text-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-raised sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          <Link href={`/organization/maintenance/${m.id}`} className="outline-none after:absolute after:inset-0 after:rounded-control focus-visible:after:ring-4 focus-visible:after:ring-primary/25">{m.name}</Link>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-dim">
                          <Link href={pageHref(m.pageId)} className="relative z-10 rounded-chip font-medium text-ink-soft outline-none hover:text-primary-ink hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">{pageNameById[m.pageId]}</Link>
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
                    </div>
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
