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

  const allClear = openIncidents.length === 0;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--ink)]">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">Everything happening across {org.name}, at a glance.</p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
            allClear ? "border-[var(--up)]/20 bg-[var(--up-soft)] text-[var(--up)]" : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${allClear ? "bg-[var(--up)] pulse-dot" : "bg-amber-500"}`} />
          {allClear ? "All systems operational" : `${openIncidents.length} open incident${openIncidents.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-4 mb-10">
        <StatCard label="Pages" value={pages.length} />
        <StatCard label="Components" value={componentCount} />
        <StatCard label="Subscribers" value={subscriberCount} />
        <StatCard label="Upcoming Maintenance" value={upcomingMaintenance} />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div>
          <h2 className="font-display text-base font-medium text-[var(--ink)] mb-3">Open Incidents</h2>
          {openIncidents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/10 bg-white/50 p-6 text-center">
              <p className="text-sm text-[var(--ink-soft)]">No open incidents. All clear.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {openIncidents.map((inc) => (
                <Link
                  key={inc.id}
                  href={`/admin/incidents/${inc.id}`}
                  className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-white p-3.5 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="font-medium text-[var(--ink)]">{inc.name}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{inc.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display text-base font-medium text-[var(--ink)] mb-3">Your Pages</h2>
          <div className="space-y-2">
            {pages.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-white p-3.5 text-sm shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--up)]" />
                  <div>
                    <span className="font-medium text-[var(--ink)]">{p.name}</span>
                    <span className="text-xs text-[var(--ink-soft)] ml-2">
                      {p.type}
                      {p.isHub ? " · hub" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 text-xs font-semibold">
                  <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="text-[var(--ink-soft)] hover:text-[var(--ink)]">
                    View
                  </a>
                  <Link href={`/admin/pages/${p.id}`} className="text-[var(--up)] hover:underline">
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
    <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
      <p className="font-display text-3xl font-medium text-[var(--ink)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--ink-soft)]">{label}</p>
    </div>
  );
}
