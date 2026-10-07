import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, Trash2, Wrench, Siren } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { COMPONENT_STATUS_LABEL, IMPACT_LABEL, MAINTENANCE_STATUS_LABEL, INCIDENT_STATUS_LABEL, type ComponentStatus, type Impact, type IncidentStatus, type MaintenanceStatus } from "@/lib/status";
import { editIncidentUpdate, postIncidentUpdate, deleteIncident, savePostmortem } from "@/app/admin/(protected)/incidents/actions";
import { deleteMaintenance, setMaintenanceStatus } from "@/app/admin/(protected)/maintenance/actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  IncidentUpdateComposer,
  MaintenanceUpdateComposer,
  PostmortemComposer,
} from "@/components/admin/IncidentCommunicationForms";
import { assertPageInOrg } from "@/lib/admin-guard";
import { sessionHasCapability } from "@/lib/admin-guard";
import { IncidentTimelineEditor } from "@/components/admin/IncidentTimelineEditor";
import { eventHref, groupPageEvents } from "@/lib/page-events";
import { TimelineItem, TimelineList, componentTone, incidentStatusTone, maintenanceStatusTone, updateStatusLabel, updateStatusTone } from "@/components/admin/operate-ui";

/** Detail screen for an incident or maintenance window, served from both sections' routes. */
export async function EventDetail({ incidentId, kind }: { incidentId: string; kind: "incident" | "maintenance" }) {
  const { session, org } = await requireSession();
  const incidentRow = await database.selectFrom("incidents").selectAll().where("id", "=", incidentId).executeTakeFirst();
  if (!incidentRow) notFound();
  if (incidentRow.isMaintenance !== (kind === "maintenance")) redirect(eventHref(incidentRow));
  const pageRow = await database.selectFrom("pages").selectAll().where("id", "=", incidentRow.pageId).executeTakeFirst();
  if (!pageRow || pageRow.orgId !== org.id) notFound();
  await assertPageInOrg(pageRow.id, org.id);
  const canUpdate = sessionHasCapability(session, "incident.update");
  const canManage = sessionHasCapability(session, "incident.manage");
  // Events is the inbox; this event's page is a filter on it. Page management is linked only for roles that may open it.
  const pageBase = sessionHasCapability(session, "page.configure") ? `/organization/pages/${pageRow.id}` : null;
  const backHref = `/organization/events?pageId=${pageRow.id}`;

  const [updates, links, pageEvents] = await Promise.all([
    database.selectFrom("incidentUpdates").selectAll().where("incidentId", "=", incidentRow.id).orderBy("createdAt").execute(),
    database.selectFrom("incidentComponents").selectAll().where("incidentId", "=", incidentRow.id).execute(),
    // ponytail: open events sit among the page's newest 50; widen if a page keeps more open at once.
    database.selectFrom("incidents").select(["id", "name", "isMaintenance", "status", "maintenanceStatus", "scheduledStart", "createdAt"])
      .where("pageId", "=", pageRow.id).where("id", "!=", incidentRow.id).orderBy("createdAt", "desc").limit(50).execute(),
  ]);
  const { active: otherActive, upcoming: otherUpcoming } = groupPageEvents(pageEvents);
  const related = [...otherActive, ...otherUpcoming];
  const components = links.length
    ? await database.selectFrom("components").selectAll()
        .where("id", "in", links.map((link) => link.componentId)).execute()
    : [];
  const componentById = new Map(components.map((component) => [component.id, component]));

  const incident = {
    ...incidentRow,
    updates,
    components: links.map((link) => ({ ...link, component: componentById.get(link.componentId)! })),
    page: pageRow,
  };

  const boundPostUpdate = postIncidentUpdate.bind(null, incidentId);
  const boundDelete = (
    incident.isMaintenance ? deleteMaintenance : deleteIncident
  ).bind(null, incidentId);
  const boundPostmortem = savePostmortem.bind(null, incidentId);
  const boundMaintenanceStatus = setMaintenanceStatus.bind(null, incidentId);

  const noun = incident.isMaintenance ? "maintenance window" : "incident";
  const currentStatus = incident.isMaintenance ? (incident.maintenanceStatus ?? "SCHEDULED") : incident.status;
  const currentStatusLabel = incident.isMaintenance
    ? MAINTENANCE_STATUS_LABEL[currentStatus as MaintenanceStatus] ?? currentStatus
    : INCIDENT_STATUS_LABEL[currentStatus as IncidentStatus] ?? currentStatus;
  const currentStatusTone = incident.isMaintenance ? maintenanceStatusTone(currentStatus) : incidentStatusTone(currentStatus);

  const showUpdateComposer = canUpdate && !incident.isMaintenance && incident.status !== "RESOLVED";
  const showMaintenanceComposer = canUpdate && incident.isMaintenance && incident.maintenanceStatus !== "COMPLETED";
  const showPostmortem = canManage && !incident.isMaintenance && incident.status === "RESOLVED";

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-dim">
            {[{ href: "/organization/events", label: "Events" }, { href: backHref, label: incident.page.name }].map((crumb) => (
              <li key={crumb.href} className="flex items-center gap-1.5">
                <Link href={crumb.href} className="rounded-chip font-medium text-ink-soft outline-none hover:text-ink hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">{crumb.label}</Link>
                <ChevronRight aria-hidden size={14} />
              </li>
            ))}
            <li aria-current="page" className="min-w-0 truncate text-ink">{incident.name}</li>
          </ol>
        </nav>
        <PageHeader
          title={incident.name}
          icon={incident.isMaintenance ? Wrench : Siren}
          hue="amber"
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <StatusBadge tone={currentStatusTone}>{currentStatusLabel}</StatusBadge>
              {pageBase
                ? <Link href={pageBase} className="rounded-chip font-semibold text-primary-ink outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">{incident.page.name}</Link>
                : <span>{incident.page.name}</span>}
              <span aria-hidden="true">·</span>
              <span>{IMPACT_LABEL[incident.impact as Impact]}</span>
              <span aria-hidden="true">·</span>
              <span>{incident.isMaintenance ? "Scheduled maintenance" : "Incident"}</span>
            </span>
          }
          actions={
            <Link href={backHref} className={buttonVariants({ variant: "secondary" })}>
              <ArrowLeft aria-hidden size={16} />
              {incident.page.name} events
            </Link>
          }
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {showUpdateComposer && (
            <Card>
              <CardHeader>
                <CardTitle>Post an update</CardTitle>
                <CardDescription>Add a new entry to the timeline and move the incident to its next status.</CardDescription>
              </CardHeader>
              <CardContent>
                <IncidentUpdateComposer
                  action={boundPostUpdate}
                  currentStatus={incident.status}
                />
              </CardContent>
            </Card>
          )}

          {showMaintenanceComposer && (
            <Card>
              <CardHeader>
                <CardTitle>Update maintenance status</CardTitle>
                <CardDescription>
                  Auto-transition is {incident.autoTransition ? "on" : "off"}: this window will {incident.autoTransition ? "" : "not "}
                  automatically start/complete based on its scheduled window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MaintenanceUpdateComposer
                  action={boundMaintenanceStatus}
                  currentStatus={incident.maintenanceStatus ?? "SCHEDULED"}
                />
              </CardContent>
            </Card>
          )}

          {showPostmortem && (
            <Card>
              <CardHeader>
                <CardTitle>Postmortem</CardTitle>
                <CardDescription>Explain what happened and what you are changing. Publish it when it is ready.</CardDescription>
              </CardHeader>
              <CardContent>
                <PostmortemComposer
                  key={`${incident.postmortemBody ?? ""}:${incident.postmortemPublishedAt?.toISOString() ?? ""}`}
                  action={boundPostmortem}
                  initialBody={incident.postmortemBody ?? ""}
                  published={Boolean(incident.postmortemPublishedAt)}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {canUpdate && !incident.isMaintenance ? (
                <IncidentTimelineEditor
                  updates={[...incident.updates].reverse().map((update) => ({
                    id: update.id,
                    status: update.status,
                    body: update.body,
                    createdAtLabel: new Date(update.createdAt).toLocaleString(),
                    editedAtLabel: update.editedAt ? new Date(update.editedAt).toLocaleString() : null,
                    notified: update.notified,
                  }))}
                  action={editIncidentUpdate.bind(null, incidentId)}
                />
              ) : (
                <TimelineList>
                  {incident.updates.map((update, index) => (
                    <TimelineItem key={update.id} current={index === incident.updates.length - 1}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <StatusBadge tone={updateStatusTone(update.status)}>{updateStatusLabel(update.status)}</StatusBadge>
                        <span className="text-xs text-ink-dim">{new Date(update.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{update.body}</p>
                    </TimelineItem>
                  ))}
                </TimelineList>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Affected components</CardTitle>
            </CardHeader>
            <CardContent>
              {incident.components.length === 0 ? (
                <p className="text-sm text-ink-dim">None</p>
              ) : (
                <ul className="space-y-2">
                  {incident.components.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 rounded-control border border-line px-3.5 py-2.5 text-sm">
                      {pageBase
                        ? <Link href={`${pageBase}/content`} className="min-w-0 truncate rounded-chip font-medium text-ink outline-none hover:text-primary-ink hover:underline focus-visible:ring-4 focus-visible:ring-primary/25">{c.component.name}</Link>
                        : <span className="min-w-0 truncate font-medium text-ink">{c.component.name}</span>}
                      <StatusBadge tone={componentTone(c.newStatus)} className="shrink-0">
                        {COMPONENT_STATUS_LABEL[c.newStatus as ComponentStatus] ?? c.newStatus}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
              {incident.pageWide && <Badge className="mt-3">Affects the whole page</Badge>}
            </CardContent>
          </Card>

          {related.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Also on {incident.page.name}</CardTitle>
                <CardDescription>Other open incidents and upcoming maintenance.</CardDescription>
              </CardHeader>
              <CardContent className="py-2">
                <ul className="divide-y divide-line">
                  {related.map((event) => {
                    const status = event.isMaintenance ? (event.maintenanceStatus ?? "SCHEDULED") : event.status;
                    return (
                      <li key={event.id}>
                        <Link href={eventHref(event)} className="-mx-2 flex items-center justify-between gap-3 rounded-control px-2 py-2.5 text-sm outline-none transition-colors duration-150 hover:bg-sunken/60 focus-visible:ring-4 focus-visible:ring-primary/25">
                          <span className="flex min-w-0 items-center gap-2">
                            {event.isMaintenance ? <Wrench aria-hidden size={14} className="shrink-0 text-ink-dim" /> : <Siren aria-hidden size={14} className="shrink-0 text-ink-dim" />}
                            <span className="truncate font-medium text-ink">{event.name}</span>
                          </span>
                          <StatusBadge tone={event.isMaintenance ? maintenanceStatusTone(status) : incidentStatusTone(status)} className="shrink-0">
                            {event.isMaintenance ? MAINTENANCE_STATUS_LABEL[status as MaintenanceStatus] : INCIDENT_STATUS_LABEL[status as IncidentStatus]}
                          </StatusBadge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {canManage && (
            <Card className="border-danger/25">
              <CardHeader className="border-danger/25">
                <CardTitle className="text-danger-fg">Danger zone</CardTitle>
                <CardDescription>
                  Permanently deletes this {noun} and its full update history. This cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={boundDelete}>
                  <PageSubmitButton variant="destructive" size="sm" pendingLabel="Deleting…" confirmMessage={`Permanently delete this ${noun} and its full update history? This cannot be undone.`}>
                    <Trash2 aria-hidden size={14} />
                    Delete {incident.isMaintenance ? "maintenance" : "incident"}
                  </PageSubmitButton>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
