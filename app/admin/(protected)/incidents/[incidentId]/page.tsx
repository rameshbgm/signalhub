import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { IMPACT_LABEL, type Impact } from "@/lib/status";
import { editIncidentUpdate, postIncidentUpdate, deleteIncident, savePostmortem } from "../actions";
import { deleteMaintenance, setMaintenanceStatus } from "../../maintenance/actions";
import { HelpTip } from "@/components/HelpTip";
import {
  IncidentUpdateComposer,
  MaintenanceUpdateComposer,
  PostmortemComposer,
} from "@/components/admin/IncidentCommunicationForms";
import { assertPageInOrg } from "@/lib/admin-guard";
import { sessionHasCapability } from "@/lib/admin-guard";
import { IncidentTimelineEditor } from "@/components/admin/IncidentTimelineEditor";

export default async function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  const { session, org } = await requireSession();
  const incidentRow = await database.selectFrom("incidents").selectAll().where("id", "=", incidentId).executeTakeFirst();
  if (!incidentRow) notFound();
  const pageRow = await database.selectFrom("pages").selectAll().where("id", "=", incidentRow.pageId).executeTakeFirst();
  if (!pageRow || pageRow.orgId !== org.id) notFound();
  await assertPageInOrg(pageRow.id, org.id);
  const canUpdate = sessionHasCapability(session, "incident.update");
  const canManage = sessionHasCapability(session, "incident.manage");

  const [updates, links] = await Promise.all([
    database.selectFrom("incidentUpdates").selectAll().where("incidentId", "=", incidentRow.id).orderBy("createdAt").execute(),
    database.selectFrom("incidentComponents").selectAll().where("incidentId", "=", incidentRow.id).execute(),
  ]);
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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">{incident.name}</h1>
        <p className="text-sm text-[var(--fg-dim)]">
          {incident.page.name} · {IMPACT_LABEL[incident.impact as Impact]} · {incident.isMaintenance ? "Scheduled Maintenance" : "Incident"}
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold mb-3 text-sm text-[var(--fg)]">Affected Components</h2>
        <ul className="text-sm text-[var(--fg-soft)] space-y-1">
          {incident.components.map((c) => (
            <li key={c.id}>
              {c.component.name} → {c.newStatus}
            </li>
          ))}
          {incident.components.length === 0 && <li className="text-[var(--fg-dim)]">None</li>}
        </ul>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold mb-3 text-sm text-[var(--fg)]">Timeline</h2>
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
          <div className="space-y-3">
            {incident.updates.map((update) => (
              <div key={update.id} className="border-l-2 border-[var(--line)] pl-3 text-sm">
                <span className="font-medium text-[var(--fg)]">{update.status}</span>
                <span className="ml-2 text-xs text-[var(--fg-dim)]">{new Date(update.createdAt).toLocaleString()}</span>
                <p className="whitespace-pre-wrap text-[var(--fg-soft)]">{update.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {canUpdate && !incident.isMaintenance && incident.status !== "RESOLVED" && (
        <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
          <h2 className="font-mono font-semibold mb-3 text-sm text-[var(--fg)]">Post an Update</h2>
          <IncidentUpdateComposer
            action={boundPostUpdate}
            currentStatus={incident.status}
          />
        </div>
      )}

      {canUpdate && incident.isMaintenance && incident.maintenanceStatus !== "COMPLETED" && (
        <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
          <h2 className="font-mono font-semibold mb-3 text-sm text-[var(--fg)]">Update Maintenance Status</h2>
          <MaintenanceUpdateComposer
            action={boundMaintenanceStatus}
            currentStatus={incident.maintenanceStatus ?? "SCHEDULED"}
          />
          <p className="text-xs text-[var(--fg-dim)] mt-2">
            Auto-transition is {incident.autoTransition ? "on" : "off"}: this window will {incident.autoTransition ? "" : "not "}
            automatically start/complete based on its scheduled window.
          </p>
        </div>
      )}

      {canManage && !incident.isMaintenance && incident.status === "RESOLVED" && (
        <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
          <h2 className="font-mono font-semibold mb-3 text-sm text-[var(--fg)]">Postmortem</h2>
          <PostmortemComposer
            key={`${incident.postmortemBody ?? ""}:${incident.postmortemPublishedAt?.toISOString() ?? ""}`}
            action={boundPostmortem}
            initialBody={incident.postmortemBody ?? ""}
            published={Boolean(incident.postmortemPublishedAt)}
          />
        </div>
      )}

      {canManage && <div className="bg-[var(--surface)] border border-[var(--red)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold mb-2 text-sm text-[var(--red)]">Danger Zone</h2>
        <form action={boundDelete} className="flex items-center gap-2">
          <button className="text-[var(--red)] border border-[var(--red)] px-3 py-1.5 text-sm hover:bg-[var(--red-soft)]">
            Delete {incident.isMaintenance ? "Maintenance" : "Incident"}
          </button>
          <HelpTip
            text={`Permanently deletes this ${
              incident.isMaintenance ? "maintenance window" : "incident"
            } and its full update history. This cannot be undone.`}
          />
        </form>
      </div>}
    </div>
  );
}
