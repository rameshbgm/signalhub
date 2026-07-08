import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { INCIDENT_STATUS_LABEL, IMPACT_LABEL, type IncidentStatus, type Impact } from "@/lib/status";

export default async function IncidentsListPage() {
  const { org } = await requireSession();
  const pages = (await collections.pages().find({ orgId: oid(org.id) }).toArray()).map(toId);
  const pageIds = pages.map((p) => oid(p.id));
  const pageNameById = Object.fromEntries(pages.map((p) => [p.id, p.name]));

  const incidents = (
    await collections
      .incidents()
      .find({ pageId: { $in: pageIds }, isMaintenance: false })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()
  ).map(toId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Incidents</h1>
        <Link href="/admin/incidents/new" className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">
          Declare Incident
        </Link>
      </div>
      <div className="space-y-2">
        {incidents.map((inc) => (
          <Link key={inc.id} href={`/admin/incidents/${inc.id}`} className="flex items-center justify-between border rounded-lg p-3 bg-white text-sm hover:shadow-sm">
            <div>
              <span className="font-medium">{inc.name}</span>
              <span className="text-xs text-gray-400 ml-2">{pageNameById[inc.pageId]}</span>
              {inc.backfilled && <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5 ml-2">backfilled</span>}
            </div>
            <div className="flex gap-2">
              <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{IMPACT_LABEL[inc.impact as Impact]}</span>
              <span className={`text-xs rounded px-1.5 py-0.5 ${inc.status === "RESOLVED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                {INCIDENT_STATUS_LABEL[inc.status as IncidentStatus]}
              </span>
            </div>
          </Link>
        ))}
        {incidents.length === 0 && <p className="text-sm text-gray-400">No incidents yet.</p>}
      </div>
    </div>
  );
}
