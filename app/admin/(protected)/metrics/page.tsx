import { Eye, EyeOff, Gauge, Plus, Send, Trash2 } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { Select } from "@/components/ui/select";
import { database } from "@/lib/postgres/client";
import {
  createMetric,
  pushMetricPoint,
  toggleMetricVisible,
  deleteMetric,
  updateMetricDecimals,
} from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";
import { NoPagesState } from "@/components/admin/operate-ui";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { formatMetricValue, metricDecimals } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  if (!pageId) {
    return (
      <div className="space-y-8">
        <PageHeader title="Metrics" icon={Gauge} hue="sky" description="Publish numbers such as response time or error rate on your status page." />
        <NoPagesState description="Metrics belong to a status page. Create one before you add metrics." canCreate={sessionHasCapability(session, "page.configure")} />
      </div>
    );
  }

  const metricRows = await database.selectFrom("metrics").selectAll().where("pageId", "=", pageId).execute();
  const metricIds = metricRows.map((metric) => metric.id);
  const latestPoints = metricIds.length
    ? await database.selectFrom("metricPoints").selectAll()
        .distinctOn("metricId").where("metricId", "in", metricIds)
        .orderBy("metricId").orderBy("timestamp", "desc").execute()
    : [];
  const latestByMetric = new Map(latestPoints.map((point) => [point.metricId, point]));
  const metrics = metricRows.map((metric) => ({
    ...metric,
    points: latestByMetric.has(metric.id) ? [latestByMetric.get(metric.id)!] : [],
  }));

  const components = await database.selectFrom("components").selectAll().where("pageId", "=", pageId).execute();
  const boundCreate = createMetric.bind(null, pageId);
  const canManage = sessionHasCapability(session, "monitor.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Metrics"
        icon={Gauge}
        hue="sky"
        description="Publish numbers such as response time or error rate on your status page."
        actions={
          <div className="w-full sm:w-60">
            <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/metrics" selected={pageId} />
          </div>
        }
      />

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Add a metric</CardTitle>
            <CardDescription>Name it, choose how it is displayed, then push data points to it.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={boundCreate} className="grid gap-4 sm:grid-cols-2">
              <Field label="Metric name" htmlFor="metric-name" required>
                <Input id="metric-name" name="name" placeholder="Metric name (e.g. API Response Time)" required />
              </Field>
              <Field label="Unit suffix" htmlFor="metric-suffix" hint="Shown after the value, such as ms or %.">
                <Input id="metric-suffix" name="suffix" placeholder="Unit suffix (e.g. ms, %)" />
              </Field>
              <Field label="Description" htmlFor="metric-description" className="sm:col-span-2">
                <Input id="metric-description" name="description" placeholder="Description (optional)" />
              </Field>
              <Field label="Component" htmlFor="metric-component">
                <Select id="metric-component" name="componentId">
                  <option value="">Not tied to a component</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Decimal places" htmlFor="metric-decimals" hint="0 to 10">
                <Input id="metric-decimals" name="decimals" type="number" min={0} max={10} step={1} defaultValue={0} />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit"><Plus aria-hidden size={16} />Add metric</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {metrics.length === 0 ? (
        <EmptyState
          icon={Gauge}
          hue="sky"
          title="No metrics yet"
          description={canManage ? "Add your first metric above, then push data points to it." : "Metrics for this page appear here once they are added."}
          className="py-16"
        />
      ) : (
        <section aria-label="Metrics" className="grid gap-5 lg:grid-cols-2">
          {metrics.map((m) => (
            <Card key={m.id}>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-base font-semibold tracking-tight text-ink">{m.name}</h2>
                      {!m.visible && <StatusBadge tone="neutral">Hidden</StatusBadge>}
                    </div>
                    <p className="mt-2 text-xs text-ink-dim">Latest value</p>
                    <p className="text-2xl font-extrabold tabular-nums tracking-tight text-ink">
                      {m.points[0] ? `${formatMetricValue(m.points[0].value, m.decimals)}${m.suffix}` : "—"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <form action={toggleMetricVisible.bind(null, m.id)}>
                        <Button type="submit" variant="outline" size="sm">
                          {m.visible ? <EyeOff aria-hidden size={14} /> : <Eye aria-hidden size={14} />}
                          {m.visible ? "Hide" : "Show"}
                        </Button>
                      </form>
                      <form action={deleteMetric.bind(null, m.id)}>
                        <Button type="submit" variant="ghost" size="sm" className="hover:bg-danger-bg hover:text-danger-fg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg">
                          <Trash2 aria-hidden size={14} />
                          Delete
                        </Button>
                      </form>
                    </div>
                  )}
                </div>

                {canManage && (
                  <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                    <form action={pushMetricPoint.bind(null, m.id)} className="flex items-end gap-2">
                      <Field label="Push data point" htmlFor={`metric-push-${m.id}`} className="min-w-0 flex-1">
                        <Input
                          id={`metric-push-${m.id}`}
                          aria-label={`Push data point for ${m.name}`}
                          name="value"
                          type="number"
                          step={10 ** -metricDecimals(m.decimals)}
                          placeholder="Value"
                          required
                        />
                      </Field>
                      <Button type="submit" variant="secondary"><Send aria-hidden size={14} />Push</Button>
                    </form>
                    <form action={updateMetricDecimals.bind(null, m.id)} className="flex items-end gap-2">
                      <Field label="Decimal places" htmlFor={`metric-decimals-${m.id}`} className="min-w-0 flex-1">
                        <Input
                          id={`metric-decimals-${m.id}`}
                          name="decimals"
                          type="number"
                          min={0}
                          max={10}
                          step={1}
                          defaultValue={metricDecimals(m.decimals)}
                        />
                      </Field>
                      <Button type="submit" variant="secondary">Save precision</Button>
                    </form>
                  </div>
                )}

                <p className="text-xs leading-5 text-ink-dim">
                  Or push programmatically:{" "}
                  <code className="break-all rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-ink-soft">POST /api/v1/manage/metrics/{m.id}/points</code>
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
