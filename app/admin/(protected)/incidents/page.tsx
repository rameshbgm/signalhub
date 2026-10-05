import Link from "next/link";
import { ChevronRight, Plus, Siren } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { INCIDENT_STATUS_LABEL, IMPACT_LABEL, type IncidentStatus, type Impact } from "@/lib/status";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { incidentStatusTone } from "@/components/admin/operate-ui";

export default async function IncidentsListPage() {
  const { session, org } = await requireSession();
  const pages = await getScopedPages(session, org.id);
  const pageIds = pages.map((p) => p.id);
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
        actions={canDeclare && incidents.length > 0 ? declareLink : undefined}
      />

      {incidents.length === 0 ? (
        <EmptyState
          icon={Siren}
          hue="amber"
          title="No incidents yet"
          description="Incidents you declare appear here, newest first, with their impact and current status."
          action={canDeclare ? declareLink : undefined}
          className="py-20"
        />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>All incidents</CardTitle>
              <CardDescription>The latest 100 across your pages.</CardDescription>
            </div>
            {openCount > 0 && <StatusBadge tone="warn">{openCount} open</StatusBadge>}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {incidents.map((inc) => (
                <li key={inc.id}>
                  <Link
                    href={`/organization/incidents/${inc.id}`}
                    className="group flex flex-col gap-2 rounded-control border border-line px-3.5 py-3 text-sm outline-none transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-raised focus-visible:ring-4 focus-visible:ring-primary/25 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{inc.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-dim">
                        <span>{pageNameById[inc.pageId]}</span>
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
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
