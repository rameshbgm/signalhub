import Link from "next/link";
import { ChevronRight, Plus, Siren } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { INCIDENT_STATUS_LABEL, IMPACT_LABEL, type IncidentStatus, type Impact } from "@/lib/status";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { PageSelect } from "@/components/admin/PageSelect";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { incidentStatusTone } from "@/components/admin/operate-ui";

export default async function IncidentsListPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  const pages = await getScopedPages(session, org.id);
  const { pageId: pageFilter } = await searchParams;
  const filteredPage = pages.find((p) => p.id === pageFilter);
  const pageIds = filteredPage ? [filteredPage.id] : pages.map((p) => p.id);
  // Each event's home is its page; roles without page management stay in this list, filtered.
  const pageHref = (id: string) => sessionHasCapability(session, "page.configure") ? `/organization/pages/${id}/events` : `/organization/incidents?pageId=${id}`;
  const pageNameById = Object.fromEntries(pages.map((p) => [p.id, p.name]));
  const canDeclare = sessionHasCapability(session, "incident.manage");

  const incidents = pageIds.length
    ? await database.selectFrom("incidents").selectAll().where("pageId", "in", pageIds)
      .where("isMaintenance", "=", false).orderBy("createdAt", "desc").limit(100).execute()
    : [];
  const openCount = incidents.filter((inc) => inc.status !== "RESOLVED").length;
  const declareLink = (
    <Link href="/organization/incidents/new" className={buttonVariants()}>
      <Plus aria-hidden size={16} />
      Declare incident
    </Link>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Incidents"
        icon={Siren}
        hue="amber"
        description="Tell your subscribers what is wrong, what you are doing about it, and when it is fixed."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pages.length > 1 && <div className="w-56"><PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/incidents" selected={filteredPage?.id} allLabel="All pages" /></div>}
            {canDeclare && incidents.length > 0 && declareLink}
          </div>
        }
      />

      {incidents.length === 0 ? (
        <EmptyState
          icon={Siren}
          hue="amber"
          title={filteredPage ? `No incidents on ${filteredPage.name}` : "No incidents yet"}
          description="Incidents you declare appear here, newest first, with their impact and current status."
          action={canDeclare ? declareLink : undefined}
          className="py-20"
        />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>{filteredPage ? filteredPage.name : "All incidents"}</CardTitle>
              <CardDescription>{filteredPage ? "The latest 100 on this page." : "The latest 100 across your pages."}</CardDescription>
            </div>
            {openCount > 0 && <StatusBadge tone="warn">{openCount} open</StatusBadge>}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {incidents.map((inc) => (
                <li key={inc.id}>
                  {/* The title link covers the row; the page link sits above it, so no anchors nest. */}
                  <div className="group relative flex flex-col gap-2 rounded-control border border-line px-3.5 py-3 text-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-raised sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        <Link href={`/organization/incidents/${inc.id}`} className="outline-none after:absolute after:inset-0 after:rounded-control focus-visible:after:ring-4 focus-visible:after:ring-primary/25">{inc.name}</Link>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-dim">
                        <Link href={pageHref(inc.pageId)} className="relative z-10 rounded-chip font-medium text-ink-soft outline-none hover:text-primary-ink hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">{pageNameById[inc.pageId]}</Link>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(inc.createdAt).toLocaleDateString()}</span>
                        {inc.backfilled && <Badge>Backfilled</Badge>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge>{IMPACT_LABEL[inc.impact as Impact]}</Badge>
                      <StatusBadge tone={incidentStatusTone(inc.status)}>{INCIDENT_STATUS_LABEL[inc.status as IncidentStatus]}</StatusBadge>
                      <ChevronRight aria-hidden size={16} className="hidden text-ink-dim transition-transform duration-200 ease-spring group-hover:translate-x-0.5 sm:block" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
