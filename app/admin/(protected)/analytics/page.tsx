import { BarChart3, ChartNoAxesCombined, Eye, Percent, Siren, UserPlus, type LucideIcon } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { PageSelect } from "@/components/admin/PageSelect";
import { NoPagesState } from "@/components/admin/operate-ui";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile, type Hue } from "@/components/ui/icon-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function StatTile({ label, value, icon, hue }: { label: string; value: number | string; icon: LucideIcon; hue: Hue }) {
  return (
    <div className="rounded-card bg-surface shadow-card ring-1 ring-line/80 p-5">
      <IconTile icon={icon} hue={hue} />
      <p className="mt-4 text-3xl font-extrabold tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{label}</p>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ pageId?: string }>;
}) {
  const { session, org } = await requireSession();
  const requested = (await searchParams).pageId;
  const pages = await getScopedPages(session, org.id, { orderBy: "name" });
  const selected = pages.find((page) => page.id === requested) ?? pages[0];
  const description = "Cookie-free, aggregate activity stored on your infrastructure.";
  if (!selected) {
    return (
      <div className="space-y-8">
        <PageHeader title="Page analytics" icon={ChartNoAxesCombined} hue="violet" description={description} />
        <NoPagesState description="Analytics are collected for each status page. Create one to start seeing activity." canCreate={sessionHasCapability(session, "page.configure")} />
      </div>
    );
  }
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
    <div className="space-y-8">
      <PageHeader
        title="Page analytics"
        icon={ChartNoAxesCombined}
        hue="violet"
        description={description}
        actions={
          <div className="w-full sm:w-60">
            <PageSelect pages={pages.map((page) => ({ id: page.id, name: page.name }))} selected={selected.id} basePath="/organization/analytics" />
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Page views" value={totals.views} icon={Eye} hue="violet" />
        <StatTile label="Incident views" value={totals.incidentViews} icon={Siren} hue="amber" />
        <StatTile label="Subscription starts" value={totals.starts} icon={UserPlus} hue="emerald" />
        <StatTile label="Conversion" value={`${conversion}%`} icon={Percent} hue="teal" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Daily activity</CardTitle>
          <CardDescription>The most recent 30 days with recorded activity. Totals above cover these days.</CardDescription>
        </CardHeader>
        {rows.length === 0 ? (
          <CardContent>
            <EmptyState icon={BarChart3} hue="violet" title="No activity recorded yet" description="Daily totals appear here once visitors view this page." className="border-0 bg-transparent py-8" />
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
                <TableHead className="text-right">Starts</TableHead>
                <TableHead className="text-right">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums text-ink">{row.date}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.views ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.incidentViews ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.subscriptionStarts ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.subscriptionCompletions ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
