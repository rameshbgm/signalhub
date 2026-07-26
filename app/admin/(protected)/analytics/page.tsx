import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { PageSelect } from "@/components/admin/PageSelect";
import { scopedPageFilter } from "@/lib/admin-guard";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ pageId?: string }>;
}) {
  const { session, org } = await requireSession();
  const requested = (await searchParams).pageId;
  const pages = await collections.pages().find(scopedPageFilter(session, org.id)).sort({ name: 1 }).toArray();
  const selected = pages.find((page) => page._id.toHexString() === requested) ?? pages[0];
  if (!selected) return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;
  const rows = await collections.analyticsDaily().find({ pageId: selected._id }).sort({ date: -1 }).limit(30).toArray();
  const totals = rows.reduce(
    (sum, row) => ({
      views: sum.views + (row.views ?? 0),
      incidentViews: sum.incidentViews + (row.incidentViews ?? 0),
      starts: sum.starts + (row.subscriptionStarts ?? 0),
      completions: sum.completions + (row.subscriptionCompletions ?? 0),
    }),
    { views: 0, incidentViews: 0, starts: 0, completions: 0 }
  );
  const conversion = totals.starts ? Math.round((totals.completions / totals.starts) * 1000) / 10 : 0;
  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Page analytics</h1>
          <p className="mt-1 text-sm text-[var(--fg-soft)]">Cookie-free, aggregate activity stored on your infrastructure.</p>
        </div>
        <div className="w-60">
          <PageSelect pages={pages.map((page) => ({ id: page._id.toHexString(), name: page.name }))} selected={selected._id.toHexString()} basePath="/organization/analytics" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Page views", totals.views],
          ["Incident views", totals.incidentViews],
          ["Subscription starts", totals.starts],
          ["Conversion", `${conversion}%`],
        ].map(([label, value]) => (
          <div key={label} className="border border-[var(--line)] bg-[var(--surface)] p-4">
            <p className="font-mono text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-[var(--fg-dim)]">{label}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto border border-[var(--line)] bg-[var(--surface)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs text-[var(--fg-dim)]">
            <tr><th className="p-3">Date</th><th>Views</th><th>Incidents</th><th>Starts</th><th>Completed</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id} className="border-b border-[var(--line)] last:border-0">
                <td className="p-3 font-mono">{row.date}</td><td>{row.views ?? 0}</td><td>{row.incidentViews ?? 0}</td><td>{row.subscriptionStarts ?? 0}</td><td>{row.subscriptionCompletions ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
