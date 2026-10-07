"use client";

import { useMemo, type ReactElement } from "react";
import { motion } from "motion/react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, PolarAngleAxis,
  RadialBar, RadialBarChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import type { MetricView } from "@/lib/page-design";
import { ANIMATION_MS, AXIS_TICK, OUTLIER_COLOR, TooltipBox, type TrendRow } from "@/components/public/metric/shared";

// Few, wide buckets so the band view summarises the series instead of tracing the line.
const BAND_BUCKETS = 12;

/** Views where the previous-period line can be overlaid. */
export const COMPARABLE_VIEWS: readonly MetricView[] = ["line", "area", "step"];

type Props = {
  view: MetricView;
  rows: TrendRow[];
  color: string;
  precision: number;
  suffix: string;
  animate: boolean;
  compare: boolean;
  summary: { latest: number; avg: number; max: number } | null;
  format: (value: number) => string;
  formatAxis: (value: number) => string;
};

/** Groups rows into at most BAND_BUCKETS windows: true min of mins, max of maxes, and the mean of means. */
function toBands(rows: TrendRow[]) {
  const size = Math.max(1, Math.ceil(rows.length / BAND_BUCKETS));
  const bands = [];
  for (let start = 0; start < rows.length; start += size) {
    const slice = rows.slice(start, start + size);
    const min = Math.min(...slice.map((row) => row.min));
    const max = Math.max(...slice.map((row) => row.max));
    bands.push({
      t: slice[0].t,
      full: slice[0].full,
      min,
      max,
      range: [min, max] as [number, number],
      average: slice.reduce((sum, row) => sum + row.value, 0) / slice.length,
    });
  }
  return bands;
}

export function TrendChart({ view, rows, color, suffix, animate, compare, summary, format, formatAxis }: Props) {
  const animation = { isAnimationActive: animate, animationDuration: ANIMATION_MS, animationEasing: "ease-out" as const };
  const bands = useMemo(() => toBands(rows), [rows]);
  const average = summary?.avg ?? 0;
  const valueLabel = suffix.trim().toLowerCase() === "ms" ? "Response time" : "Value";

  const xAxis = <XAxis dataKey="t" tick={AXIS_TICK} minTickGap={30} axisLine={{ stroke: "var(--line)" }} tickLine={false} />;
  const yAxis = <YAxis tick={AXIS_TICK} tickFormatter={formatAxis} width={56} axisLine={false} tickLine={false} />;
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />;
  // One custom tooltip for every view: the metric name is already the card title, and recharts'
  // default content repeated a line per series (scatter has one for each axis).
  const tooltip = (
    <Tooltip
      content={({ active, payload }) => {
        const row = active ? (payload?.[0]?.payload as (Partial<TrendRow> & { average?: number }) | undefined) : undefined;
        if (!row) return null;
        const lines: [string, string][] = row.average !== undefined && row.min !== undefined && row.max !== undefined
          ? [["Average", format(row.average)], ["Range", `${format(row.min)} – ${format(row.max)}`]]
          : [[valueLabel, format(row.value ?? 0)]];
        if (compare && row.prev !== undefined) lines.push(["Previous period", format(row.prev)]);
        return <TooltipBox heading={row.full} lines={lines} />;
      }}
    />
  );
  const previousLine = compare
    ? <Line type={view === "step" ? "stepAfter" : "monotone"} dataKey="prev" stroke="var(--fg-dim)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} connectNulls name="Previous period" {...animation} />
    : null;

  let chart: ReactElement;
  if (view === "area") {
    chart = (
      <ComposedChart data={rows}>
        {grid}{xAxis}{yAxis}{tooltip}
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.35} dot={false} {...animation} />
        {previousLine}
      </ComposedChart>
    );
  } else if (view === "bar") {
    chart = (
      <BarChart data={rows}>
        {grid}{xAxis}{yAxis}{tooltip}
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={14} {...animation} />
      </BarChart>
    );
  } else if (view === "step") {
    chart = (
      <LineChart data={rows}>
        {grid}{xAxis}{yAxis}{tooltip}
        <Line type="stepAfter" dataKey="value" stroke={color} dot={false} strokeWidth={2} {...animation} />
        {previousLine}
      </LineChart>
    );
  } else if (view === "scatter") {
    chart = (
      <ScatterChart>
        {grid}
        <XAxis
          type="number"
          dataKey="index"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(index: number) => rows[index]?.t ?? ""}
          tick={AXIS_TICK}
          minTickGap={30}
          axisLine={{ stroke: "var(--line)" }}
          tickLine={false}
        />
        {yAxis}
        {tooltip}
        <Scatter data={rows} dataKey="value" fill={color} fillOpacity={0.85} {...animation}>
          {rows.map((row) => <Cell key={row.index} fill={row.value > average ? OUTLIER_COLOR : color} />)}
        </Scatter>
      </ScatterChart>
    );
  } else if (view === "bands") {
    chart = (
      <ComposedChart data={bands}>
        {grid}{xAxis}{yAxis}{tooltip}
        <Area type="monotone" dataKey="range" stroke="none" fill={color} fillOpacity={0.3} name="Range" {...animation} />
        <Line type="monotone" dataKey="max" stroke={color} strokeOpacity={0.5} strokeDasharray="3 3" dot={false} strokeWidth={1} name="Max" {...animation} />
        <Line type="monotone" dataKey="min" stroke={color} strokeOpacity={0.5} strokeDasharray="3 3" dot={false} strokeWidth={1} name="Min" {...animation} />
        <Line type="monotone" dataKey="average" stroke={color} dot={{ r: 3, fill: color }} strokeWidth={2} name="Average" {...animation} />
      </ComposedChart>
    );
  } else if (view === "gauge") {
    chart = (
      <RadialBarChart data={[{ name: valueLabel, value: summary?.latest ?? 0 }]} cx="50%" cy="85%" innerRadius="115%" outerRadius="165%" startAngle={180} endAngle={0} barSize={16}>
        <PolarAngleAxis type="number" domain={[0, summary?.max || 1]} tick={false} />
        <RadialBar dataKey="value" cornerRadius={8} fill={color} background={{ fill: "var(--line)" }} {...animation} />
      </RadialBarChart>
    );
  } else if (view === "heatmap") {
    return <Heatmap rows={rows} color={color} animate={animate} format={format} />;
  } else {
    chart = (
      <LineChart data={rows}>
        {grid}{xAxis}{yAxis}{tooltip}
        <ReferenceLine y={average} stroke="var(--fg-dim)" strokeDasharray="4 4" label={{ value: `avg ${format(average)}`, position: "insideBottomRight", fontSize: 10, fill: "var(--fg-dim)" }} />
        <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} {...animation} />
        {previousLine}
      </LineChart>
    );
  }

  return (
    <div className="relative h-full">
      <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
      {view === "gauge" && summary && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center">
          <div className="text-2xl font-semibold tabular-nums text-[var(--fg)]">{format(summary.latest)}</div>
          <div className="text-[10px] text-[var(--fg-dim)]">latest · avg {format(summary.avg)} · peak {format(summary.max)}</div>
        </div>
      )}
    </div>
  );
}

function Heatmap({ rows, color, animate, format }: { rows: TrendRow[]; color: string; animate: boolean; format: (value: number) => string }) {
  const values = rows.map((row) => row.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(14px, 1fr))" }} role="img" aria-label="Samples over time, darker is higher">
        {rows.map((row, index) => (
          <motion.span
            key={row.index}
            title={`${row.full} · ${format(row.value)}`}
            className="block h-4 rounded-[3px]"
            style={{ background: `color-mix(in srgb, ${color} ${Math.round(12 + ((row.value - low) / span) * 88)}%, transparent)` }}
            initial={animate ? { opacity: 0, scale: 0.4 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: animate ? Math.min(index * 0.012, 0.6) : 0, duration: animate ? 0.3 : 0 }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-[var(--fg-dim)]">
        <span>{format(low)}</span>
        <span className="h-1.5 w-24 rounded-full" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 12%, transparent), ${color})` }} aria-hidden />
        <span>{format(high)}</span>
      </div>
    </div>
  );
}
