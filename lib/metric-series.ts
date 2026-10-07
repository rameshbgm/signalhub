import { sql } from "kysely";
import { database } from "@/lib/postgres/client";
import { classifyFailure, type FailureKind } from "@/lib/failure-kind";

export { classifyFailure, type FailureKind };

/** Visitor-selectable windows. Bucket widths give roughly 90-100 points per chart. */
export const SERIES_RANGES = {
  "24h": { windowMs: 86_400_000, bucketSec: 900, cellSec: 3_600 },
  "7d": { windowMs: 7 * 86_400_000, bucketSec: 7_200, cellSec: 86_400 },
  "30d": { windowMs: 30 * 86_400_000, bucketSec: 28_800, cellSec: 86_400 },
  "90d": { windowMs: 90 * 86_400_000, bucketSec: 86_400, cellSec: 86_400 },
} as const;
export type SeriesRangeId = keyof typeof SERIES_RANGES;
export const SERIES_RANGE_IDS = Object.keys(SERIES_RANGES) as SeriesRangeId[];

const HISTOGRAM_BINS = 8;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 200;
const GROUP_LIMIT = 500;

export type SeriesBucket = { t: string; avg: number; min: number; max: number; p50: number; p95: number; p99: number; count: number };
export type RangeSummary = { latest: number; avg: number; min: number; max: number; p95: number; count: number };
export type HistogramBin = { from: number; to: number | null; count: number };
export type UptimeCell = { t: string; total: number; ok: number };
export type RangeInsight = {
  buckets: SeriesBucket[];
  summary: RangeSummary | null;
  previous: { summary: RangeSummary | null; buckets: { t: string; avg: number }[] };
  histogram: HistogramBin[];
  /** Present only when the metric is recorded by a monitor. */
  checks: {
    uptimePct: number | null;
    cells: UptimeCell[];
    codes: { code: number; count: number }[];
    failures: { kind: FailureKind; count: number }[];
  } | null;
};
export type MetricInsights = Record<SeriesRangeId, RangeInsight>;

type BucketRow = { metricId: string; period: "current" | "previous"; t: Date; avg: number; min: number; max: number; p50: number; p95: number; p99: number; count: string };
type SummaryRow = { metricId: string; latest: number; avg: number; min: number; max: number; p95: number; p99: number; count: string };
type HistogramRow = { metricId: string; bin: number; count: string };

const summaryOf = (row: SummaryRow | undefined): RangeSummary | null =>
  row && Number(row.count) > 0
    ? { latest: row.latest, avg: row.avg, min: row.min, max: row.max, p95: row.p95, count: Number(row.count) }
    : null;

/** Aggregates one range for every metric: buckets over the window plus the previous window, summary and histogram. */
async function loadRange(metricIds: string[], range: SeriesRangeId, now: Date) {
  const { windowMs, bucketSec } = SERIES_RANGES[range];
  const start = new Date(now.getTime() - windowMs);
  const previousStart = new Date(now.getTime() - 2 * windowMs);
  const ids = sql`${sql.val(metricIds)}::uuid[]`;

  const buckets = await sql<BucketRow>`
    select metric_id,
           case when "timestamp" >= ${start} then 'current' else 'previous' end as period,
           date_bin(make_interval(secs => ${bucketSec}::double precision), "timestamp", timestamptz '2000-01-01 00:00:00+00') as t,
           avg(value) as avg, min(value) as min, max(value) as max,
           percentile_cont(0.5) within group (order by value) as p50,
           percentile_cont(0.95) within group (order by value) as p95,
           percentile_cont(0.99) within group (order by value) as p99,
           count(*) as count
    from metric_points
    where metric_id = any(${ids}) and "timestamp" >= ${previousStart} and "timestamp" < ${now}
    group by metric_id, period, t
    order by metric_id, t
  `.execute(database);

  const summaries = await sql<SummaryRow & { period: "current" | "previous" }>`
    select metric_id,
           case when "timestamp" >= ${start} then 'current' else 'previous' end as period,
           (array_agg(value order by "timestamp" desc))[1] as latest,
           avg(value) as avg, min(value) as min, max(value) as max,
           percentile_cont(0.95) within group (order by value) as p95,
           percentile_cont(0.99) within group (order by value) as p99,
           count(*) as count
    from metric_points
    where metric_id = any(${ids}) and "timestamp" >= ${previousStart} and "timestamp" < ${now}
    group by metric_id, period
  `.execute(database);

  // Equal-width bins from the minimum to p99, plus an "above p99" bin, so one spike does not flatten the rest.
  const bounds = new Map<string, { lo: number; hi: number }>();
  for (const row of summaries.rows) {
    if (row.period === "current" && row.p99 > row.min) bounds.set(row.metricId, { lo: row.min, hi: row.p99 });
  }
  const boundIds = [...bounds.keys()];
  const histogramRows = boundIds.length
    ? (await sql<HistogramRow>`
        select p.metric_id, width_bucket(p.value, b.lo, b.hi, ${HISTOGRAM_BINS}) as bin, count(*) as count
        from metric_points p
        join unnest(${sql.val(boundIds)}::uuid[], ${sql.val(boundIds.map((id) => bounds.get(id)!.lo))}::double precision[], ${sql.val(boundIds.map((id) => bounds.get(id)!.hi))}::double precision[])
          as b(metric_id, lo, hi) on b.metric_id = p.metric_id
        where p."timestamp" >= ${start} and p."timestamp" < ${now}
        group by p.metric_id, bin
      `.execute(database)).rows
    : [];

  return { buckets: buckets.rows, summaries: summaries.rows, histogramRows, bounds, start };
}

type ChecksCellRow = { metricId: string; t: Date; total: string; ok: string };
type ChecksGroupRow = { metricId: string; statusCode: number | null; ok: boolean; error: string | null; count: string };

/** Uptime cells and response breakdown for metrics recorded by a monitor. Reads monitor_checks via monitors.metric_id. */
async function loadChecks(metricIds: string[], range: SeriesRangeId, now: Date) {
  const { windowMs, cellSec } = SERIES_RANGES[range];
  const start = new Date(now.getTime() - windowMs);
  const ids = sql`${sql.val(metricIds)}::uuid[]`;
  const cells = await sql<ChecksCellRow>`
    select m.metric_id,
           date_bin(make_interval(secs => ${cellSec}::double precision), c.checked_at, timestamptz '2000-01-01 00:00:00+00') as t,
           count(*) as total, count(*) filter (where c.ok) as ok
    from monitors m join monitor_checks c on c.monitor_id = m.id
    where m.metric_id = any(${ids}) and c.checked_at >= ${start} and c.checked_at < ${now}
    group by m.metric_id, t
    order by m.metric_id, t
  `.execute(database);
  const groups = await sql<ChecksGroupRow>`
    select m.metric_id, c.status_code, c.ok, c.error, count(*) as count
    from monitors m join monitor_checks c on c.monitor_id = m.id
    where m.metric_id = any(${ids}) and c.checked_at >= ${start} and c.checked_at < ${now}
    group by m.metric_id, c.status_code, c.ok, c.error
    order by count(*) desc
    limit ${GROUP_LIMIT}
  `.execute(database);
  return { cells: cells.rows, groups: groups.rows };
}

/** Folds the loaded rows of one range into a per-metric RangeInsight. */
function assemble(metricId: string, loaded: Awaited<ReturnType<typeof loadRange>>, checks: Awaited<ReturnType<typeof loadChecks>>, linked: boolean): RangeInsight {
  const own = loaded.buckets.filter((row) => row.metricId === metricId);
  const current = own.filter((row) => row.period === "current");
  const previous = own.filter((row) => row.period === "previous");
  const summaries = loaded.summaries.filter((row) => row.metricId === metricId);
  const bound = loaded.bounds.get(metricId);

  let histogram: HistogramBin[] = [];
  if (bound) {
    const counts = new Map(loaded.histogramRows.filter((row) => row.metricId === metricId).map((row) => [row.bin, Number(row.count)]));
    const step = (bound.hi - bound.lo) / HISTOGRAM_BINS;
    histogram = Array.from({ length: HISTOGRAM_BINS }, (_, index) => ({
      from: bound.lo + index * step,
      to: bound.lo + (index + 1) * step,
      // width_bucket numbers the bins 1..N, with 0 below the range and N + 1 at or above its upper bound.
      count: counts.get(index + 1) ?? 0,
    }));
    histogram.push({ from: bound.hi, to: null, count: counts.get(HISTOGRAM_BINS + 1) ?? 0 });
  }

  let checksInsight: RangeInsight["checks"] = null;
  if (linked) {
    const cells = checks.cells.filter((row) => row.metricId === metricId).map((row) => ({ t: row.t.toISOString(), total: Number(row.total), ok: Number(row.ok) }));
    const total = cells.reduce((sum, cell) => sum + cell.total, 0);
    const ok = cells.reduce((sum, cell) => sum + cell.ok, 0);
    const codes = new Map<number, number>();
    const failures = new Map<FailureKind, number>();
    for (const group of checks.groups.filter((row) => row.metricId === metricId)) {
      const count = Number(group.count);
      if (group.statusCode !== null) codes.set(group.statusCode, (codes.get(group.statusCode) ?? 0) + count);
      if (!group.ok && group.statusCode === null) {
        const kind = classifyFailure(group.error);
        failures.set(kind, (failures.get(kind) ?? 0) + count);
      }
    }
    checksInsight = {
      uptimePct: total ? (ok / total) * 100 : null,
      cells,
      codes: [...codes].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      failures: [...failures].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    };
  }

  return {
    buckets: current.map((row) => ({ t: row.t.toISOString(), avg: row.avg, min: row.min, max: row.max, p50: row.p50, p95: row.p95, p99: row.p99, count: Number(row.count) })),
    summary: summaryOf(summaries.find((row) => row.period === "current")),
    previous: {
      summary: summaryOf(summaries.find((row) => row.period === "previous")),
      buckets: previous.map((row) => ({ t: row.t.toISOString(), avg: row.avg })),
    },
    histogram,
    checks: checksInsight,
  };
}

const cache = new Map<string, { at: number; value: Map<string, MetricInsights> }>();

/**
 * Chart insights for every range and metric on a page, aggregated in SQL.
 * Cached for a minute per set of metrics: the public page is hot and the data
 * only changes when a monitor polls. ponytail: per-process cache; move to a shared one if replicas multiply.
 */
export async function getMetricInsights(metricIds: string[], now = new Date()): Promise<Map<string, MetricInsights>> {
  if (!metricIds.length) return new Map();
  const key = [...metricIds].sort().join(",");
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.value;

  const linkedRows = await database.selectFrom("monitors").select("metricId")
    .where("metricId", "in", metricIds).execute();
  const linked = new Set(linkedRows.map((row) => row.metricId));
  const linkedIds = [...linked].filter((id): id is string => Boolean(id));

  const result = new Map<string, MetricInsights>(metricIds.map((id) => [id, {} as MetricInsights]));
  await Promise.all(SERIES_RANGE_IDS.map(async (range) => {
    const [loaded, checks] = await Promise.all([
      loadRange(metricIds, range, now),
      linkedIds.length ? loadChecks(linkedIds, range, now) : Promise.resolve({ cells: [], groups: [] }),
    ]);
    for (const id of metricIds) result.get(id)![range] = assemble(id, loaded, checks, linked.has(id));
  }));

  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(key, { at: now.getTime(), value: result });
  return result;
}
