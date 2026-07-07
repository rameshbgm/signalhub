import { notFound } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";
import { INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, MAINTENANCE_STATUSES, MAINTENANCE_STATUS_LABEL, IMPACT_LABEL, type Impact } from "@/lib/status";
import { postIncidentUpdate, deleteIncident, savePostmortem } from "../actions";
import { setMaintenanceStatus } from "../../maintenance/actions";

export default async function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  const { org } = await requireSession();
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      updates: { orderBy: { createdAt: "asc" } },
      components: { include: { component: true } },
      page: true,
    },
  });
  if (!incident || incident.page.orgId !== org.id) notFound();

  const boundPostUpdate = postIncidentUpdate.bind(null, incidentId);
  const boundDelete = deleteIncident.bind(null, incidentId);
  const boundPostmortem = savePostmortem.bind(null, incidentId);
  const boundMaintenanceStatus = setMaintenanceStatus.bind(null, incidentId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{incident.name}</h1>
        <p className="text-sm text-gray-400">
          {incident.page.name} · {IMPACT_LABEL[incident.impact as Impact]} · {incident.isMaintenance ? "Scheduled Maintenance" : "Incident"}
        </p>
      </div>

      <div className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold mb-3 text-sm">Affected Components</h2>
        <ul className="text-sm text-gray-600 space-y-1">
          {incident.components.map((c) => (
            <li key={c.id}>
              {c.component.name} → {c.newStatus}
            </li>
          ))}
          {incident.components.length === 0 && <li className="text-gray-400">None</li>}
        </ul>
      </div>

      <div className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold mb-3 text-sm">Timeline</h2>
        <div className="space-y-3">
          {incident.updates.map((u) => (
            <div key={u.id} className="text-sm border-l-2 border-gray-100 pl-3">
              <span className="font-medium">{u.status}</span>
              <span className="text-xs text-gray-400 ml-2">{new Date(u.createdAt).toLocaleString()}</span>
              <p className="text-gray-600 whitespace-pre-wrap">{u.body}</p>
            </div>
          ))}
        </div>
      </div>

      {!incident.isMaintenance && incident.status !== "RESOLVED" && (
        <div className="bg-white border rounded-lg p-5">
          <h2 className="font-semibold mb-3 text-sm">Post an Update</h2>
          <form action={boundPostUpdate} className="space-y-3">
            <select name="status" defaultValue={incident.status} className="w-full border rounded-md px-3 py-2 text-sm">
              {INCIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INCIDENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <textarea name="body" rows={3} placeholder="What's the latest?" className="w-full border rounded-md px-3 py-2 text-sm" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notify" defaultChecked /> Notify subscribers
            </label>
            <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Post Update</button>
          </form>
        </div>
      )}

      {incident.isMaintenance && incident.maintenanceStatus !== "COMPLETED" && (
        <div className="bg-white border rounded-lg p-5">
          <h2 className="font-semibold mb-3 text-sm">Update Maintenance Status</h2>
          <form action={boundMaintenanceStatus} className="space-y-3">
            <select name="maintenanceStatus" defaultValue={incident.maintenanceStatus ?? "SCHEDULED"} className="w-full border rounded-md px-3 py-2 text-sm">
              {MAINTENANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MAINTENANCE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <textarea name="body" rows={2} placeholder="Update message" className="w-full border rounded-md px-3 py-2 text-sm" required />
            <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Update</button>
          </form>
          <p className="text-xs text-gray-400 mt-2">
            Auto-transition is {incident.autoTransition ? "on" : "off"}: this window will {incident.autoTransition ? "" : "not "}
            automatically start/complete based on its scheduled window.
          </p>
        </div>
      )}

      {!incident.isMaintenance && incident.status === "RESOLVED" && (
        <div className="bg-white border rounded-lg p-5">
          <h2 className="font-semibold mb-3 text-sm">Postmortem</h2>
          <form action={boundPostmortem} className="space-y-3">
            <textarea
              name="postmortemBody"
              rows={8}
              defaultValue={incident.postmortemBody ?? ""}
              placeholder="## Summary&#10;## Timeline&#10;## Root Cause&#10;## Remediation"
              className="w-full border rounded-md px-3 py-2 text-sm font-mono"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="publish" defaultChecked={!!incident.postmortemPublishedAt} /> Publish to public page &amp; notify subscribers
            </label>
            <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Save Postmortem</button>
          </form>
        </div>
      )}

      <div className="bg-white border border-red-200 rounded-lg p-5">
        <h2 className="font-semibold mb-2 text-sm text-red-700">Danger Zone</h2>
        <form action={boundDelete}>
          <button className="text-red-600 border border-red-300 rounded-md px-3 py-1.5 text-sm hover:bg-red-50">Delete Incident</button>
        </form>
      </div>
    </div>
  );
}
