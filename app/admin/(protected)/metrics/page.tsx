import { requireSession } from "@/lib/require-session";
import { FluentSelect } from "@/components/FluentSelect";
import { database } from "@/lib/postgres/client";
import {
  createMetric,
  pushMetricPoint,
  toggleMetricVisible,
  deleteMetric,
  updateMetricDecimals,
} from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";
import { getScopedPages, sessionHasCapability } from "@/lib/admin-guard";
import { formatMetricValue, metricDecimals } from "@/lib/status";

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  if (!pageId) return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;

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
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">Metrics</h1>
        <div className="w-full sm:w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/metrics" selected={pageId} />
        </div>
      </div>

      {canManage && <form action={boundCreate} className="grid gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2">
        <input
          name="name"
          placeholder="Metric name (e.g. API Response Time)"
          className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)]"
          required
        />
        <input
          name="suffix"
          placeholder="Unit suffix (e.g. ms, %)"
          className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)]"
        />
        <input
          name="description"
          placeholder="Description (optional)"
          className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] sm:col-span-2"
        />
        <FluentSelect
          aria-label="Component"
          name="componentId"
          className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--cyan)]"
        >
          <option value="">Not tied to a component</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FluentSelect>
        <label className="flex items-center gap-3 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg-soft)]">
          Decimal places
          <input
            name="decimals"
            type="number"
            min={0}
            max={10}
            step={1}
            defaultValue={0}
            className="ml-auto w-16 border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-right text-[var(--fg)] outline-none focus:border-[var(--cyan)]"
          />
        </label>
        <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-medium text-[var(--on-cyan)] transition-opacity hover:opacity-90 sm:col-span-2">
          Add Metric
        </button>
      </form>}

      <div className="space-y-2">
        {metrics.map((m) => (
          <div key={m.id} className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-medium text-[var(--fg)]">{m.name}</span>
                <span className="ml-2 text-xs text-[var(--fg-dim)]">
                  latest:{" "}
                  {m.points[0]
                    ? `${formatMetricValue(m.points[0].value, m.decimals)}${m.suffix}`
                    : "—"}
                </span>
                {!m.visible && <span className="ml-2 bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs text-[var(--fg-soft)]">hidden</span>}
              </div>
              {canManage && <div className="flex gap-3">
                <form action={toggleMetricVisible.bind(null, m.id)}>
                  <button className="border border-[var(--cyan)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--cyan)] transition-colors hover:bg-[var(--cyan-soft)]">{m.visible ? "Hide" : "Show"}</button>
                </form>
                <form action={deleteMetric.bind(null, m.id)}>
                  <button className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">Delete</button>
                </form>
              </div>}
            </div>
            {canManage && (
              <form
                action={updateMetricDecimals.bind(null, m.id)}
                className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3"
              >
                <label className="text-xs text-[var(--fg-soft)]" htmlFor={`metric-decimals-${m.id}`}>
                  Decimal places
                </label>
                <input
                  id={`metric-decimals-${m.id}`}
                  name="decimals"
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  defaultValue={metricDecimals(m.decimals)}
                  className="w-16 border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-right text-xs text-[var(--fg)] outline-none focus:border-[var(--cyan)]"
                />
                <button className="border border-[var(--line-bright)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--fg)] transition-colors hover:border-[var(--cyan)]">
                  Save precision
                </button>
              </form>
            )}
            {canManage && <form action={pushMetricPoint.bind(null, m.id)} className="mt-3 flex gap-2">
              <input
                aria-label={`Push data point for ${m.name}`}
                name="value"
                type="number"
                step={10 ** -metricDecimals(m.decimals)}
                placeholder="Push a data point"
                className="flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)]"
                required
              />
              <button className="bg-[var(--surface-raised)] border border-[var(--line-bright)] px-3 py-2 text-xs text-[var(--fg)] transition-colors hover:border-[var(--cyan)]">
                Push
              </button>
            </form>}
            <p className="mt-2 text-xs text-[var(--fg-dim)]">
              Or push programmatically:{" "}
              <code className="bg-[var(--surface-raised)] px-1 text-[var(--fg-soft)]">POST /api/v1/manage/metrics/{m.id}/points</code>
            </p>
          </div>
        ))}
        {metrics.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No metrics yet.</p>}
      </div>
    </div>
  );
}
