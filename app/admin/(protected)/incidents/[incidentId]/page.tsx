import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { IMPACT_LABEL, type Impact } from "@/lib/status";
import { postIncidentUpdate, deleteIncident, savePostmortem } from "../actions";
import { deleteMaintenance, setMaintenanceStatus } from "../../maintenance/actions";
import { HelpTip } from "@/components/HelpTip";
import {
  IncidentUpdateComposer,
  MaintenanceUpdateComposer,
  PostmortemComposer,
} from "@/components/admin/IncidentCommunicationForms";
import { assertPageInOrg } from "@/lib/admin-guard";
import { sessionHasCapability } from "@/lib/admin-guard";

export default async function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  const { session, org } = await requireSession();
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc) notFound();
  const pageDoc = await collections.pages().findOne({ _id: incidentDoc.pageId });
  if (!pageDoc || pageDoc.orgId.toHexString() !== org.id) notFound();
  await assertPageInOrg(pageDoc._id.toHexString(), org.id);
  const canUpdate = sessionHasCapability(session, "incident.update");
  const canManage = sessionHasCapability(session, "incident.manage");

  const [updateDocs, linkDocs, templateDocs] = await Promise.all([
    collections.incidentUpdates().find({ incidentId: incidentDoc._id }).sort({ createdAt: 1 }).toArray(),
    collections.incidentComponents().find({ incidentId: incidentDoc._id }).toArray(),
    collections.incidentTemplates().find({ pageId: incidentDoc.pageId, archivedAt: null }).toArray(),
  ]);
  const componentDocs = linkDocs.length
    ? await collections.components().find({ _id: { $in: linkDocs.map((l) => l.componentId) } }).toArray()
    : [];
  const componentById = new Map(componentDocs.map((c) => [c._id.toHexString(), toId(c)]));

  const incident = {
    ...toId(incidentDoc),
    updates: updateDocs.map(toId),
    components: linkDocs.map((l) => ({ ...toId(l), component: componentById.get(l.componentId.toHexString())! })),
    page: toId(pageDoc),
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
        <div className="space-y-3">
          {incident.updates.map((u) => (
            <div key={u.id} className="text-sm border-l-2 border-[var(--line)] pl-3">
              <span className="font-medium text-[var(--fg)]">{u.status}</span>
              <span className="text-xs text-[var(--fg-dim)] ml-2">{new Date(u.createdAt).toLocaleString()}</span>
              <p className="text-[var(--fg-soft)] whitespace-pre-wrap">{u.body}</p>
            </div>
          ))}
        </div>
      </div>

      {canUpdate && !incident.isMaintenance && incident.status !== "RESOLVED" && (
        <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
          <h2 className="font-mono font-semibold mb-3 text-sm text-[var(--fg)]">Post an Update</h2>
          <IncidentUpdateComposer
            action={boundPostUpdate}
            currentStatus={incident.status}
            incidentName={incident.name}
            pageName={incident.page.name}
            componentNames={incident.components.map((component) => component.component.name)}
            templates={templateDocs.filter((template) => ["UPDATE", "RESOLUTION"].includes(template.kind ?? "")).map(toId)}
          />
        </div>
      )}

      {canUpdate && incident.isMaintenance && incident.maintenanceStatus !== "COMPLETED" && (
        <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
          <h2 className="font-mono font-semibold mb-3 text-sm text-[var(--fg)]">Update Maintenance Status</h2>
          <MaintenanceUpdateComposer
            action={boundMaintenanceStatus}
            currentStatus={incident.maintenanceStatus ?? "SCHEDULED"}
            incidentName={incident.name}
            pageName={incident.page.name}
            componentNames={incident.components.map(
              (component) => component.component.name
            )}
            templates={templateDocs
              .filter((template) => template.kind === "MAINTENANCE")
              .map(toId)}
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
            action={boundPostmortem}
            initialBody={incident.postmortemBody ?? ""}
            published={Boolean(incident.postmortemPublishedAt)}
            incidentName={incident.name}
            pageName={incident.page.name}
            componentNames={incident.components.map(
              (component) => component.component.name
            )}
            templates={templateDocs.filter((template) => template.kind === "POSTMORTEM").map(toId)}
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
