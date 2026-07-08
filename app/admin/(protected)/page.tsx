import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";

export default async function AdminDashboard() {
  const { org } = await requireSession();

  const pages = await prisma.page.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
  const pageIds = pages.map((p) => p.id);

  const [openIncidents, subscriberCount, componentCount, upcomingMaintenance] = await Promise.all([
    prisma.incident.findMany({
      where: { pageId: { in: pageIds }, isMaintenance: false, status: { not: "RESOLVED" } },
      include: { updates: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subscriber.count({ where: { pageId: { in: pageIds } } }),
    prisma.component.count({ where: { pageId: { in: pageIds } } }),
    prisma.incident.count({ where: { pageId: { in: pageIds }, isMaintenance: true, maintenanceStatus: "SCHEDULED" } }),
  ]);

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
