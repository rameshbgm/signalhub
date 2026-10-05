import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { PageSelect } from "@/components/admin/PageSelect";
import { getScopedPages } from "@/lib/admin-guard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ pageId?: string }>;
}) {
  const { session, org } = await requireSession();
  const requested = (await searchParams).pageId;
  const pages = await getScopedPages(session, org.id, { orderBy: "name" });
  const selected = pages.find((page) => page.id === requested) ?? pages[0];
  if (!selected) return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;
  const rows = await database.selectFrom("analyticsDaily").selectAll()
    .where("pageId", "=", selected.id).orderBy("date", "desc").limit(30).execute();
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
          <PageSelect pages={pages.map((page) => ({ id: page.id, name: page.name }))} selected={selected.id} basePath="/organization/analytics" />
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
      <div className="border border-[var(--line)] bg-[var(--surface)]">
        <Table className="text-left text-sm">
          <TableHeader className="text-xs text-[var(--fg-dim)]">
            <TableRow><TableHead className="p-3">Date</TableHead><TableHead>Views</TableHead><TableHead>Incidents</TableHead><TableHead>Starts</TableHead><TableHead>Completed</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="border-b border-[var(--line)] last:border-0">
                <TableCell className="p-3 font-mono">{row.date}</TableCell><TableCell>{row.views ?? 0}</TableCell><TableCell>{row.incidentViews ?? 0}</TableCell><TableCell>{row.subscriptionStarts ?? 0}</TableCell><TableCell>{row.subscriptionCompletions ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
