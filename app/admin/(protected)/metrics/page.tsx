import Link from "next/link";
import { Gauge } from "lucide-react";
import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { bulkMetricAction, deleteMetric, pushMetricPoint, toggleMetricVisible, updateMetricDecimals } from "./actions";
import { MetricList, type MetricListItem } from "@/components/admin/MetricList";
import { PageSelect } from "@/components/admin/PageSelect";
import { NoPagesState } from "@/components/admin/operate-ui";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { formatMetricValue } from "@/lib/status";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

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

  const metricRows = await database.selectFrom("metrics").selectAll().where("pageId", "=", pageId).orderBy("name", "asc").execute();
  const metricIds = metricRows.map((metric) => metric.id);
  const latestPoints = metricIds.length
    ? await database.selectFrom("metricPoints").selectAll()
        .distinctOn("metricId").where("metricId", "in", metricIds)
        .orderBy("metricId").orderBy("timestamp", "desc").execute()
    : [];
  const latestByMetric = new Map(latestPoints.map((point) => [point.metricId, point]));
  const components = await database.selectFrom("components").select(["id", "name"]).where("pageId", "=", pageId).execute();
  const componentsById = new Map(components.map((c) => [c.id, c.name]));
  const canManage = sessionHasCapability(session, "monitor.manage");
  // Server-render timestamp used only to show how old the latest value is.
  // eslint-disable-next-line react-hooks/purity
  const renderedAt = Date.now();

  const items: MetricListItem[] = metricRows.map((m) => {
    const point = latestByMetric.get(m.id);
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      decimals: m.decimals,
      visible: m.visible,
      latest: point ? `${formatMetricValue(point.value, m.decimals)}${m.suffix}` : null,
      lastPointAt: point ? new Date(point.timestamp).toISOString() : null,
      componentName: m.componentId ? componentsById.get(m.componentId) ?? "Unknown component" : null,
      actions: {
        push: pushMetricPoint.bind(null, m.id),
        precision: updateMetricDecimals.bind(null, m.id),
        toggle: toggleMetricVisible.bind(null, m.id),
        remove: deleteMetric.bind(null, m.id),
      },
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metrics"
        icon={Gauge}
        hue="sky"
        description="Publish numbers such as response time or error rate on your status page."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="w-full sm:w-60">
              <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/metrics" selected={pageId} />
            </div>
            {canManage && (
              <Link href={`/organization/metrics/new?pageId=${pageId}`} className={buttonVariants()}>
                Add metric
              </Link>
            )}
          </div>
        }
      />

      {!canManage && (
        <Alert tone="info">
          Read-only metric access. A responder or administrator can manage metrics.
        </Alert>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Gauge}
          hue="sky"
          title="No metrics yet"
          description={canManage ? "Use Add metric to create the first one, then push data points to it." : "Metrics for this page appear here once they are added."}
          className="py-20"
        />
      ) : (
        <MetricList metrics={items} canManage={canManage} now={renderedAt} bulkAction={bulkMetricAction.bind(null, pageId)} viewsKey={pageId} />
      )}
    </div>
  );
}
