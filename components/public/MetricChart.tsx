"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatMetricValue, metricDecimals } from "@/lib/status";
import { formatPageDate } from "@/lib/page-locale";
import { SERIES_RANGES } from "@/lib/metric-ranges";
import type { MetricInsights } from "@/lib/metric-series";
import type { MetricLens, MetricRange, MetricView } from "@/lib/page-design";
import { COMPARABLE_VIEWS, TrendChart } from "@/components/public/metric/TrendChart";
import { DistributionChart, PercentileChart, ResponsesPanel, UptimePanel } from "@/components/public/metric/InsightCharts";
import { CHART_HEIGHT, LENS_LABELS, RANGE_LABELS, VIEWS, type TrendRow } from "@/components/public/metric/shared";

export type MetricChartOptions = {
  ranges: MetricRange[];
  defaultRange: MetricRange;
  lenses: MetricLens[];
  chartViews: MetricView[];
  showStats: boolean;
};

type Prefs = { range: MetricRange; lens: MetricLens; view: MetricView; compare: boolean };

/**
 * A visitor's choices for one chart live in localStorage. useSyncExternalStore keeps the server HTML on the
 * defaults (no hydration mismatch, no effect) and anything the page owner has since disabled falls back to them.
 */
function usePrefs(storageKey: string, defaults: Prefs, allowed: { ranges: MetricRange[]; lenses: MetricLens[]; views: MetricView[] }): [Prefs, (patch: Partial<Prefs>) => void] {
  const subscribe = useCallback((notify: () => void) => {
    const listener = (event: StorageEvent) => { if (event.key === storageKey) notify(); };
    window.addEventListener("storage", listener);
    window.addEventListener("signalhub:metric-prefs", notify);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("signalhub:metric-prefs", notify);
    };
  }, [storageKey]);
  const raw = useSyncExternalStore(
    subscribe,
    () => { try { return window.localStorage.getItem(storageKey) ?? ""; } catch { return ""; } },
    () => "",
  );
  const prefs = useMemo<Prefs>(() => {
    let stored: Partial<Prefs> = {};
    try { stored = raw ? (JSON.parse(raw) as Partial<Prefs>) : {}; } catch { /* corrupt value: use defaults */ }
    return {
      range: allowed.ranges.includes(stored.range as MetricRange) ? (stored.range as MetricRange) : defaults.range,
      lens: allowed.lenses.includes(stored.lens as MetricLens) ? (stored.lens as MetricLens) : defaults.lens,
      view: allowed.views.includes(stored.view as MetricView) ? (stored.view as MetricView) : defaults.view,
      compare: stored.compare === true,
    };
  }, [raw, defaults, allowed]);
  const update = useCallback((patch: Partial<Prefs>) => {
    try { window.localStorage.setItem(storageKey, JSON.stringify({ ...prefs, ...patch })); } catch { /* storage blocked: choices last until reload */ }
    window.dispatchEvent(new Event("signalhub:metric-prefs"));
  }, [storageKey, prefs]);
  return [prefs, update];
}

function percentChange(current: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function MetricChart({
  id,
  name,
  suffix,
  color,
  decimals,
  insights,
  options,
  locale = "en",
  timeZone = "UTC",
}: {
  id: string;
  name: string;
  suffix: string;
  color: string;
  decimals: number;
  insights: MetricInsights;
  options: MetricChartOptions;
  locale?: string;
  timeZone?: string;
}) {
  const precision = metricDecimals(decimals);
  const animate = !useReducedMotion();
  const hasChecks = Boolean(insights["24h"]?.checks);
  const lenses = useMemo(() => {
    const available = options.lenses.filter((lens) => (lens === "uptime" || lens === "responses" ? hasChecks : true));
    return available.length ? available : (["trend"] as MetricLens[]);
  }, [options.lenses, hasChecks]);
  const ranges = options.ranges;
  const views = useMemo(() => VIEWS.filter((view) => options.chartViews.includes(view.id)), [options.chartViews]);
  const defaults = useMemo<Prefs>(() => ({
    range: ranges.includes(options.defaultRange) ? options.defaultRange : ranges[0],
    lens: lenses[0],
    view: options.chartViews.includes("line") ? "line" : options.chartViews[0],
    compare: false,
  }), [ranges, lenses, options.defaultRange, options.chartViews]);
  const allowed = useMemo(() => ({ ranges, lenses, views: options.chartViews }), [ranges, lenses, options.chartViews]);
  const [prefs, setPrefs] = usePrefs(`signalhub:metric:${id}`, defaults, allowed);

  const insight = insights[prefs.range];
  const format = (value: number) => `${formatMetricValue(value, precision)}${suffix}`;
  const formatAxis = (value: number) => formatMetricValue(value, precision);
  const formatDate = (iso: string) => formatPageDate(iso, { language: locale, timeZone, month: "short", day: "numeric", ...(prefs.range === "24h" ? { hour: "numeric", minute: "2-digit" } : {}) });

  const rows = useMemo<TrendRow[]>(() => {
    const windowMs = SERIES_RANGES[prefs.range].windowMs;
    const previous = new Map(insight.previous.buckets.map((bucket) => [Date.parse(bucket.t), bucket.avg]));
    const round = (value: number) => Number(formatMetricValue(value, precision));
    const shortOptions = prefs.range === "24h" ? { hour: "numeric", minute: "2-digit" } as const : { month: "short", day: "numeric" } as const;
    return insight.buckets.map((bucket, index) => {
      const earlier = previous.get(Date.parse(bucket.t) - windowMs);
      return {
        index,
        t: formatPageDate(bucket.t, { language: locale, timeZone, ...shortOptions }),
        full: formatPageDate(bucket.t, { language: locale, timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        value: round(bucket.avg),
        min: round(bucket.min),
        max: round(bucket.max),
        p50: round(bucket.p50),
        p95: round(bucket.p95),
        p99: round(bucket.p99),
        prev: earlier === undefined ? undefined : round(earlier),
      };
    });
  }, [insight, prefs.range, locale, timeZone, precision]);

  const summary = insight.summary;
  const lowerIsBetter = suffix.trim().toLowerCase() === "ms";
  const stats = summary ? [
    { label: "Latest", value: summary.latest, delta: null },
    { label: "Average", value: summary.avg, delta: percentChange(summary.avg, insight.previous.summary?.avg) },
    { label: "Min", value: summary.min, delta: null },
    { label: "Max", value: summary.max, delta: null },
    { label: "p95", value: summary.p95, delta: percentChange(summary.p95, insight.previous.summary?.p95) },
  ] : [];

  const canCompare = prefs.lens === "trend" && COMPARABLE_VIEWS.includes(prefs.view) && insight.previous.buckets.length > 0;
  const noData = !insight.buckets.length && (prefs.lens === "trend" || prefs.lens === "percentiles" || prefs.lens === "distribution");
  const transition = { duration: animate ? 0.25 : 0 };

  let body;
  if (noData) {
    body = <div className="grid h-full place-items-center text-xs text-[var(--fg-dim)]">No data in this range yet.</div>;
  } else if (prefs.lens === "percentiles") {
    body = <PercentileChart rows={rows} color={color} animate={animate} format={format} formatAxis={formatAxis} />;
  } else if (prefs.lens === "distribution") {
    body = <DistributionChart bins={insight.histogram} color={color} animate={animate} format={format} formatAxis={formatAxis} />;
  } else if (prefs.lens === "uptime") {
    body = <UptimePanel insight={insight} range={prefs.range} animate={animate} formatDate={formatDate} />;
  } else if (prefs.lens === "responses") {
    body = <ResponsesPanel insight={insight} animate={animate} />;
  } else {
    body = (
      <TrendChart
        view={prefs.view}
        rows={rows}
        color={color}
        precision={precision}
        suffix={suffix}
        animate={animate}
        compare={prefs.compare && canCompare}
        summary={summary ? { latest: summary.latest, avg: summary.avg, max: summary.max } : null}
        format={format}
        formatAxis={formatAxis}
      />
    );
  }

  return (
    <div className="public-metric bg-[var(--surface)] border border-[var(--line)] p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-mono font-semibold text-[var(--fg)]">
          {name} <span className="text-[var(--fg-dim)] font-normal">({suffix || "value"})</span>
        </h4>
        {ranges.length > 1 && (
          <div role="radiogroup" aria-label={`${name} time range`} className="flex gap-0.5">
            {ranges.map((range) => {
              const active = prefs.range === range;
              return (
                <button
                  key={range}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPrefs({ range })}
                  className="relative px-2 py-1 text-xs font-medium tabular-nums transition-colors hover:text-[var(--fg)]"
                  style={{ color: active ? color : "var(--fg-dim)" }}
                >
                  {active && <motion.span layoutId={`metric-range-${id}`} className="absolute inset-0" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)` }} transition={animate ? { type: "spring", stiffness: 500, damping: 36 } : { duration: 0 }} />}
                  <span className="relative">{RANGE_LABELS[range]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {options.showStats && stats.length > 0 && (
        <dl className="mb-3 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-5">
          {stats.map((stat) => {
            const worse = stat.delta !== null && lowerIsBetter && stat.delta > 0;
            const better = stat.delta !== null && lowerIsBetter && stat.delta < 0;
            return (
              <div key={stat.label} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-[var(--fg-dim)]">{stat.label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-[var(--fg)]">
                  {format(stat.value)}
                  {stat.delta !== null && Math.abs(stat.delta) >= 0.1 && (
                    <span className="ml-1 text-[10px] font-medium" style={{ color: worse ? "#d97706" : better ? "#059669" : "var(--fg-dim)" }} title="Compared with the previous period">
                      {stat.delta > 0 ? "▲" : "▼"} {Math.abs(stat.delta).toFixed(Math.abs(stat.delta) < 10 ? 1 : 0)}%
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {lenses.length > 1 && (
        <div role="tablist" aria-label={`${name} information`} className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--line)]">
          {lenses.map((lens) => {
            const active = prefs.lens === lens;
            return (
              <button
                key={lens}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPrefs({ lens })}
                className="relative pb-1.5 text-xs font-medium transition-colors hover:text-[var(--fg)]"
                style={{ color: active ? color : "var(--fg-dim)" }}
              >
                {LENS_LABELS[lens]}
                {active && <motion.span layoutId={`metric-lens-${id}`} className="absolute inset-x-0 -bottom-px h-0.5" style={{ background: color }} transition={animate ? { type: "spring", stiffness: 500, damping: 36 } : { duration: 0 }} />}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative" style={{ height: CHART_HEIGHT }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${prefs.lens}-${prefs.range}-${prefs.lens === "trend" ? prefs.view : ""}`}
            className="absolute inset-0"
            initial={animate ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0, y: -8 } : { opacity: 0 }}
            transition={transition}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex min-h-8 flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {prefs.lens === "trend" && views.length > 1 && (
          <div role="radiogroup" aria-label={`${name} chart style`} className="flex flex-wrap items-center justify-center gap-1">
            {views.map(({ id: viewId, label, icon: Icon, tone }) => {
              const active = prefs.view === viewId;
              return (
                <button
                  key={viewId}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  title={label}
                  onClick={() => setPrefs({ view: viewId })}
                  className="relative grid size-8 place-items-center border border-transparent transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                  style={{ color: tone, opacity: active ? 1 : 0.7 }}
                >
                  {active && (
                    <motion.span
                      layoutId={`metric-view-pill-${id}`}
                      className="absolute inset-0"
                      style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)` }}
                      transition={animate ? { type: "spring", stiffness: 500, damping: 36 } : { duration: 0 }}
                    />
                  )}
                  <Icon aria-hidden size={15} className="relative" />
                </button>
              );
            })}
          </div>
        )}
        {canCompare && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--fg-dim)]">
            <input type="checkbox" checked={prefs.compare} onChange={(event) => setPrefs({ compare: event.target.checked })} className="size-3.5 cursor-pointer" style={{ accentColor: color }} />
            Compare to previous period
          </label>
        )}
      </div>
    </div>
  );
}
