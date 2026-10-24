import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isDatabaseId } from "@/lib/database-id";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { InlineActionForm } from "@/components/InlineActionForm";
import { ArrowLeft, ChevronRight, Trash2, Wrench, Siren, Eye, EyeOff } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { COMPONENT_STATUS_LABEL, IMPACT_LABEL, MAINTENANCE_STATUS_LABEL, INCIDENT_STATUS_LABEL, type ComponentStatus, type Impact, type IncidentStatus, type MaintenanceStatus } from "@/lib/status";
import { editIncidentDetails, editIncidentUpdate, postIncidentUpdate, setIncidentPublicVisibility, savePostmortem } from "@/app/admin/(protected)/incidents/actions";
import { IncidentForm } from "@/components/admin/IncidentForm";
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
import { eventHref, groupPageEvents, isOpenEvent } from "@/lib/page-events";
import { TimelineItem, TimelineList, componentTone, incidentStatusTone, maintenanceStatusTone, updateStatusLabel, updateStatusTone } from "@/components/admin/operate-ui";

/** Detail screen for an incident or maintenance window at /organization/events/{id}. */
export async function EventDetail({ incidentId }: { incidentId: string }) {
  const { session, org } = await requireSession();
  if (!isDatabaseId(incidentId)) notFound();
  const incidentRow = await database.selectFrom("incidents").selectAll().where("id", "=", incidentId).executeTakeFirst();
  if (!incidentRow) notFound();
  const pageRow = await database.selectFrom("pages").selectAll().where("id", "=", incidentRow.pageId).executeTakeFirst();
  if (!pageRow || pageRow.orgId !== org.id) notFound();
  await assertPageInOrg(pageRow.id, org.id);
  const canUpdate = sessionHasCapability(session, "incident.update");
  const canManage = sessionHasCapability(session, "incident.manage");
  // Events is the inbox; this event's page is a filter on it. Page management is linked only for roles that may open it.
  const pageBase = sessionHasCapability(session, "page.configure") ? `/organization/pages/${pageRow.id}` : null;
  const backHref = `/organization/events?pageId=${pageRow.id}`;

  const [updates, links, pageEvents, pageComponents] = await Promise.all([
    database.selectFrom("incidentUpdates").selectAll().where("incidentId", "=", incidentRow.id).orderBy("createdAt").orderBy("id").execute(),
    database.selectFrom("incidentComponents").selectAll().where("incidentId", "=", incidentRow.id).execute(),
    database.selectFrom("incidents").select(["id", "name", "isMaintenance", "status", "maintenanceStatus", "scheduledStart", "createdAt"])
      .where("pageId", "=", pageRow.id).where("id", "!=", incidentRow.id).where(isOpenEvent).execute(),
    database.selectFrom("components").select(["id", "name"]).where("pageId", "=", pageRow.id).orderBy("order").execute(),
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
  const boundDelete = deleteMaintenance.bind(null, incidentId);
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
              {!incident.isMaintenance && !incident.publicVisible && <Badge>Hidden from public page</Badge>}
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
          {canManage && !incident.isMaintenance && (
            <details className="rounded-card border border-line bg-surface p-4">
              <summary className="cursor-pointer font-medium text-ink">Edit incident details</summary>
              <p className="mt-2 text-sm text-ink-dim">{incident.status === "RESOLVED" ? "Correct the title or message of this closed incident. Publish a postmortem for follow-up." : "Correcting the latest message updates the public timeline. Subscribers are notified only if you choose to notify them."}</p>
              <div className="mt-4">
                <IncidentForm
                  key={`${incident.id}:${incident.publicVisible}:${incident.status}:${incident.impact}:${incident.pageWide}:${incident.backfilled}:${incident.updates.at(-1)?.id ?? ""}:${incident.updates.at(-1)?.editedAt?.toISOString() ?? ""}:${links.map((link) => `${link.componentId}-${link.newStatus}`).join(":")}`}
                  action={editIncidentDetails.bind(null, incidentId)}
                  pageId={pageRow.id}
                  components={pageComponents}
                  initial={{
                    latestUpdateId: incident.updates.at(-1)?.id ?? "",
                    latestEditedAt: incident.updates.at(-1)?.editedAt?.toISOString() ?? "",
                    publicVisible: incident.publicVisible,
                    name: incident.name,
                    body: incident.updates.at(-1)?.body ?? "",
                    status: incident.status,
                    impact: incident.impact,
                    pageWide: incident.pageWide,
                    backfilled: incident.backfilled,
                    components: links.map((link) => ({ componentId: link.componentId, status: link.newStatus })),
                  }}
                />
              </div>
            </details>
          )}
          {showUpdateComposer && (
            <Card>
              <CardHeader>
                <CardTitle>Post an update</CardTitle>
                <CardDescription>Add a new entry to the timeline and move the incident to its next status.</CardDescription>
              </CardHeader>
              <CardContent>
                <IncidentUpdateComposer
                  key={`${incident.status}:${incident.publicVisible}`}
                  publicVisible={incident.publicVisible}
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
                  publicVisible={incident.publicVisible}
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
                  resolved={incident.status === "RESOLVED"}
                  updates={[...incident.updates].reverse().map((update) => ({
                    id: update.id,
                    status: update.status,
                    body: update.body,
                    createdAtLabel: new Date(update.createdAt).toLocaleString(),
                    editedAt: update.editedAt?.toISOString() ?? "",
                    editedAtLabel: update.editedAt ? new Date(update.editedAt).toLocaleString() : null,
                    notified: update.notified,
                    action: editIncidentUpdate.bind(null, incidentId, update.id),
                  }))}
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
              <CardTitle>{!incident.isMaintenance && incident.status === "RESOLVED" ? "Previously affected components" : "Affected components"}</CardTitle>
              {!incident.isMaintenance && incident.status === "RESOLVED" && <CardDescription>Historical incident statuses. This resolved incident no longer changes service health.</CardDescription>}
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

          {!incident.isMaintenance && (
            <Card>
              <CardHeader>
                <CardTitle>Public visibility</CardTitle>
                <CardDescription>{incident.publicVisible ? "Visible on the public page, history, feeds, and incident link." : "Hidden from public pages, history, feeds, and incident links. Its full history remains in the console."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-ink-dim">Hiding does not resolve the incident or change service health. You can restore its public visibility later.</p>
                {canManage ? <PlatformActionForm action={setIncidentPublicVisibility.bind(null, incidentId, !incident.publicVisible)} successMessage={incident.publicVisible ? "Incident hidden from public page" : "Incident restored to public page"}>
                  <PageSubmitButton variant="secondary" pendingLabel={incident.publicVisible ? "Hiding…" : "Restoring…"} confirmMessage={incident.publicVisible ? "Hide this incident from public pages, history, feeds, and direct links? Its history remains available in the console." : "Restore this incident and its full timeline to the public page?"}>
                    {incident.publicVisible ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
                    {incident.publicVisible ? "Hide from public page" : "Unhide from public page"}
                  </PageSubmitButton>
                </PlatformActionForm> : <p className="text-xs text-ink-dim">Only Admins and Incident Managers can hide or restore an incident.</p>}
              </CardContent>
            </Card>
          )}

          {canManage && incident.isMaintenance && (
            <Card className="border-danger/25">
              <CardHeader className="border-danger/25">
                <CardTitle className="text-danger-fg">Danger zone</CardTitle>
                <CardDescription>
                  Permanently deletes this {noun} and its full update history. This cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InlineActionForm action={boundDelete}>
                  <PageSubmitButton variant="destructive" size="sm" pendingLabel="Deleting…" confirmMessage={`Permanently delete this ${noun} and its full update history? This cannot be undone.`}>
                    <Trash2 aria-hidden size={14} />
                    Delete maintenance
                  </PageSubmitButton>
                </InlineActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
