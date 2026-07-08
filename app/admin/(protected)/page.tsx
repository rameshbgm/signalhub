import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";

export default async function AdminDashboard() {
  const { org } = await requireSession();

  const pages = (await collections.pages().find({ orgId: oid(org.id) }).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageIds = pages.map((p) => oid(p.id));

  const [openIncidentDocs, subscriberCount, componentCount, upcomingMaintenance] = await Promise.all([
    collections
      .incidents()
      .find({ pageId: { $in: pageIds }, isMaintenance: false, status: { $ne: "RESOLVED" } })
      .sort({ createdAt: -1 })
      .toArray(),
    collections.subscribers().countDocuments({ pageId: { $in: pageIds } }),
    collections.components().countDocuments({ pageId: { $in: pageIds } }),
    collections.incidents().countDocuments({ pageId: { $in: pageIds }, isMaintenance: true, maintenanceStatus: "SCHEDULED" }),
  ]);
  const openIncidents = openIncidentDocs.map(toId);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Dashboard</h1>

      <div className="grid sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Pages" value={pages.length} />
        <StatCard label="Components" value={componentCount} />
        <StatCard label="Subscribers" value={subscriberCount} />
        <StatCard label="Upcoming Maintenance" value={upcomingMaintenance} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-3">Open Incidents</h2>
          {openIncidents.length === 0 ? (
            <p className="text-sm text-gray-400">No open incidents. All clear.</p>
          ) : (
            <div className="space-y-2">
              {openIncidents.map((inc) => (
                <Link key={inc.id} href={`/admin/incidents/${inc.id}`} className="block border rounded-lg p-3 bg-white hover:shadow-sm text-sm">
                  <span className="font-medium">{inc.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{inc.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-semibold mb-3">Your Pages</h2>
          <div className="space-y-2">
            {pages.map((p) => (
              <div key={p.id} className="flex items-center justify-between border rounded-lg p-3 bg-white text-sm">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{p.type}{p.isHub ? " · hub" : ""}</span>
                </div>
                <div className="flex gap-3">
                  <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    View
                  </a>
                  <Link href={`/admin/pages/${p.id}`} className="text-blue-600 hover:underline">
                    Manage
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
