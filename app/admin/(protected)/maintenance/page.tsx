import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { syncAutoMaintenance } from "@/lib/maintenance-sync";
import { MAINTENANCE_STATUS_LABEL, type MaintenanceStatus } from "@/lib/status";

export default async function MaintenanceListPage() {
  await syncAutoMaintenance();
  const { org } = await requireSession();
  const pages = (await collections.pages().find({ orgId: oid(org.id) }).toArray()).map(toId);
  const pageIds = pages.map((p) => oid(p.id));
  const pageNameById = Object.fromEntries(pages.map((p) => [p.id, p.name]));

  const maintenance = (
    await collections.incidents().find({ pageId: { $in: pageIds }, isMaintenance: true }).sort({ scheduledStart: -1 }).toArray()
  ).map(toId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Scheduled Maintenance</h1>
        <Link href="/admin/maintenance/new" className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">
          Schedule Maintenance
        </Link>
      </div>
      <div className="space-y-2">
        {maintenance.map((m) => (
          <Link key={m.id} href={`/admin/incidents/${m.id}`} className="flex items-center justify-between border rounded-lg p-3 bg-white text-sm hover:shadow-sm">
            <div>
              <span className="font-medium">{m.name}</span>
              <span className="text-xs text-gray-400 ml-2">{pageNameById[m.pageId]}</span>
              {m.scheduledStart && (
                <span className="text-xs text-gray-400 ml-2">
                  {new Date(m.scheduledStart).toLocaleString()} → {m.scheduledEnd ? new Date(m.scheduledEnd).toLocaleString() : "TBD"}
                </span>
              )}
            </div>
            <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">
              {MAINTENANCE_STATUS_LABEL[(m.maintenanceStatus as MaintenanceStatus) ?? "SCHEDULED"]}
            </span>
          </Link>
        ))}
        {maintenance.length === 0 && <p className="text-sm text-gray-400">No maintenance scheduled.</p>}
      </div>
    </div>
  );
}
