"use client";

import { useCallback, useId, useMemo, useSyncExternalStore, type ReactElement } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, PolarAngleAxis,
  RadialBar, RadialBarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartArea, ChartCandlestick, ChartColumn, ChartLine, ChartNoAxesCombined, ChartScatter, Gauge, Grid3x3, type LucideIcon } from "lucide-react";
import { formatMetricValue, metricDecimals } from "@/lib/status";
import { formatPageDate } from "@/lib/page-locale";

const VIEWS = [
  { id: "line", label: "Line", icon: ChartLine },
  { id: "area", label: "Area", icon: ChartArea },
  { id: "bar", label: "Bars", icon: ChartColumn },
  { id: "step", label: "Step", icon: ChartNoAxesCombined },
  { id: "scatter", label: "Scatter", icon: ChartScatter },
  { id: "bands", label: "Min / avg / max", icon: ChartCandlestick },
  { id: "gauge", label: "Gauge", icon: Gauge },
  { id: "heatmap", label: "Heatmap", icon: Grid3x3 },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

type ViewId = (typeof VIEWS)[number]["id"];

const CHART_HEIGHT = 160;
const ANIMATION_MS = 700;
const BAND_BUCKETS = 24;

/** The remembered view lives in localStorage; useSyncExternalStore keeps server HTML on "line" and avoids an effect. */
function useStoredView(storageKey: string): [ViewId, (view: ViewId) => void] {
  const subscribe = useCallback((notify: () => void) => {
    const listener = (event: StorageEvent) => { if (event.key === storageKey) notify(); };
    window.addEventListener("storage", listener);
    window.addEventListener("signalhub:metric-view", notify);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("signalhub:metric-view", notify);
    };
  }, [storageKey]);
  const read = useCallback((): ViewId => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return VIEWS.some((view) => view.id === stored) ? (stored as ViewId) : "line";
    } catch {
      return "line";
    }
  }, [storageKey]);
  const view = useSyncExternalStore(subscribe, read, () => "line" as ViewId);
  const write = useCallback((next: ViewId) => {
    try { window.localStorage.setItem(storageKey, next); } catch { /* storage blocked: the view still changes for this tab via the event */ }
    window.dispatchEvent(new Event("signalhub:metric-view"));
  }, [storageKey]);
  return [view, write];
}

export function MetricChart({
  id,
  name,
  suffix,
  points,
  color,
  decimals,
  locale = "en",
  timeZone = "UTC",
}: {
  id: string;
  name: string;
  suffix: string;
  points: { timestamp: string; value: number }[];
  color: string;
  decimals: number;
  locale?: string;
  timeZone?: string;
}) {
  const precision = metricDecimals(decimals);
  const reduceMotion = Boolean(useReducedMotion());
  const [view, setView] = useStoredView(`signalhub:metric-view:${id}`);
  const gradientId = `metric-fill-${useId().replace(/:/g, "")}`;
  const animate = !reduceMotion;
  const animation = { isAnimationActive: animate, animationDuration: ANIMATION_MS, animationEasing: "ease-out" as const };

  const data = useMemo(() => points.map((point, index) => ({
    index,
    t: formatPageDate(point.timestamp, { language: locale, timeZone, month: "short", day: "numeric" }),
    full: formatPageDate(point.timestamp, { language: locale, timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    value: Number(formatMetricValue(point.value, precision)),
  })), [points, locale, timeZone, precision]);

  const stats = useMemo(() => {
    const values = data.map((point) => point.value);
    return {
      latest: values.at(-1) ?? 0,
      peak: values.length ? Math.max(...values) : 0,
      low: values.length ? Math.min(...values) : 0,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    };
  }, [data]);

  const bands = useMemo(() => {
    const size = Math.max(1, Math.ceil(data.length / BAND_BUCKETS));
    const buckets = [];
    for (let start = 0; start < data.length; start += size) {
      const slice = data.slice(start, start + size);
      const values = slice.map((point) => point.value);
      buckets.push({
        t: slice[0].t,
        full: slice[0].full,
        range: [Math.min(...values), Math.max(...values)] as [number, number],
        average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(precision)),
      });
    }
    return buckets;
  }, [data, precision]);

  const axisProps = {
    xAxis: <XAxis dataKey="t" tick={{ fontSize: 10, fill: "var(--fg-dim)" }} minTickGap={30} axisLine={{ stroke: "var(--line)" }} tickLine={false} />,
    yAxis: (
      <YAxis
        tick={{ fontSize: 10, fill: "var(--fg-dim)" }}
        tickFormatter={(value: number) => formatMetricValue(value, precision)}
        width={56}
        axisLine={false}
        tickLine={false}
      />
    ),
    grid: <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />,
  };
  const format = (value: unknown) => `${formatMetricValue(Number(Array.isArray(value) ? value[0] : value ?? 0), precision)}${suffix}`;
  const tooltip = (
    <Tooltip
      formatter={(value) => {
        if (Array.isArray(value)) return [`${format(value[0])} – ${format(value[1])}`, "Range"];
        return [format(value), name];
      }}
      labelFormatter={(label, payload) => String(payload?.[0]?.payload?.full ?? label)}
      contentStyle={{ borderRadius: 0, border: "1px solid var(--line-bright)", background: "var(--surface-raised)", fontSize: 12, color: "var(--fg)" }}
      labelStyle={{ color: "var(--fg-soft)" }}
    />
  );

  let chart: ReactElement;
  if (view === "area") {
    chart = (
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{tooltip}
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} {...animation} />
      </AreaChart>
    );
  } else if (view === "bar") {
    chart = (
      <BarChart data={data}>
        {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{tooltip}
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={14} {...animation} />
      </BarChart>
    );
  } else if (view === "step") {
    chart = (
      <LineChart data={data}>
        {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{tooltip}
        <Line type="stepAfter" dataKey="value" stroke={color} dot={false} strokeWidth={2} {...animation} />
      </LineChart>
    );
  } else if (view === "scatter") {
    chart = (
      <ScatterChart>
        {axisProps.grid}
        <XAxis type="number" dataKey="index" hide domain={["dataMin", "dataMax"]} />
        {axisProps.yAxis}
        {tooltip}
        <Scatter data={data} dataKey="value" fill={color} fillOpacity={0.75} {...animation} />
      </ScatterChart>
    );
  } else if (view === "bands") {
    chart = (
      <ComposedChart data={bands}>
        {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{tooltip}
        <Area type="monotone" dataKey="range" stroke="none" fill={color} fillOpacity={0.18} name="Range" {...animation} />
        <Line type="monotone" dataKey="average" stroke={color} dot={false} strokeWidth={2} name="Average" {...animation} />
      </ComposedChart>
    );
  } else if (view === "gauge") {
    chart = (
      <RadialBarChart data={[{ name, value: stats.latest }]} cx="50%" cy="85%" innerRadius="115%" outerRadius="165%" startAngle={180} endAngle={0} barSize={16}>
        <PolarAngleAxis type="number" domain={[0, stats.peak || 1]} tick={false} />
        <RadialBar dataKey="value" cornerRadius={8} fill={color} background={{ fill: "var(--line)" }} {...animation} />
      </RadialBarChart>
    );
  } else {
    chart = (
      <LineChart data={data}>
        {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{tooltip}
        <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} {...animation} />
      </LineChart>
    );
  }

  const span = stats.peak - stats.low || 1;
  const transition = { duration: animate ? 0.25 : 0 };

  return (
    <div className="public-metric bg-[var(--surface)] border border-[var(--line)] p-5">
      <h4 className="text-sm font-mono font-semibold mb-3 text-[var(--fg)]">
        {name} <span className="text-[var(--fg-dim)] font-normal">({suffix || "value"})</span>
      </h4>
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className="absolute inset-0"
            initial={animate ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animate ? { opacity: 0, y: -8 } : { opacity: 0 }}
            transition={transition}
          >
            {view === "heatmap" ? (
              <div className="flex h-full flex-col justify-center gap-3">
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14px, 1fr))" }} role="img" aria-label={`${name} samples, darker is higher`}>
                  {data.map((point, index) => (
                    <motion.span
                      key={point.index}
                      title={`${point.full} · ${format(point.value)}`}
                      className="block h-4 rounded-[3px]"
                      style={{ background: `color-mix(in srgb, ${color} ${Math.round(12 + ((point.value - stats.low) / span) * 88)}%, transparent)` }}
                      initial={animate ? { opacity: 0, scale: 0.4 } : false}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: animate ? Math.min(index * 0.012, 0.6) : 0, duration: animate ? 0.3 : 0 }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--fg-dim)]">
                  <span>{format(stats.low)}</span>
                  <span className="h-1.5 w-24 rounded-full" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 12%, transparent), ${color})` }} aria-hidden />
                  <span>{format(stats.peak)}</span>
                </div>
              </div>
            ) : (
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
                {view === "gauge" && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center">
                    <div className="text-2xl font-semibold tabular-nums text-[var(--fg)]">{format(stats.latest)}</div>
                    <div className="text-[10px] text-[var(--fg-dim)]">latest · avg {format(stats.average)} · peak {format(stats.peak)}</div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div role="radiogroup" aria-label={`${name} chart view`} className="mt-3 flex flex-wrap items-center justify-center gap-1">
        {VIEWS.map(({ id: viewId, label, icon: Icon }) => {
          const active = view === viewId;
          return (
            <button
              key={viewId}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={label}
              onClick={() => setView(viewId)}
              className="relative grid size-8 place-items-center border border-transparent text-[var(--fg-dim)] transition-colors hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
              style={{ color: active ? color : undefined }}
            >
              {active && (
                <motion.span
                  layoutId={`metric-view-pill-${id}`}
                  className="absolute inset-0"
                  style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)` }}
                  transition={animate ? { type: "spring", stiffness: 500, damping: 36 } : { duration: 0 }}
                />
              )}
              <Icon aria-hidden size={15} className="relative" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
