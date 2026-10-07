"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FailureKind, HistogramBin, RangeInsight } from "@/lib/metric-series";
import { SERIES_RANGES, type SeriesRangeId } from "@/lib/metric-ranges";
import { ANIMATION_MS, AXIS_TICK, OUTLIER_COLOR, P95_COLOR, P99_COLOR, TooltipBox, type TrendRow } from "@/components/public/metric/shared";

type Formatters = { format: (value: number) => string; formatAxis: (value: number) => string };

const animationProps = (animate: boolean) => ({ isAnimationActive: animate, animationDuration: ANIMATION_MS, animationEasing: "ease-out" as const });

/** p50 / p95 / p99 per bucket: tail latency shows slowdowns that the average hides. */
export function PercentileChart({ rows, color, animate, format, formatAxis }: Formatters & { rows: TrendRow[]; color: string; animate: boolean }) {
  const animation = animationProps(animate);
  return (
    <div className="relative h-full">
      <div className="absolute right-2 top-0 z-10 flex gap-3 text-[10px] text-[var(--fg-dim)]" aria-hidden>
        {[["p50", color], ["p95", P95_COLOR], ["p99", P99_COLOR]].map(([label, tone]) => (
          <span key={label} className="inline-flex items-center gap-1"><span className="h-0.5 w-3" style={{ background: tone }} />{label}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="t" tick={AXIS_TICK} minTickGap={30} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
          <YAxis tick={AXIS_TICK} tickFormatter={formatAxis} width={56} axisLine={false} tickLine={false} />
          <Tooltip
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as TrendRow | undefined) : undefined;
              return row ? <TooltipBox heading={row.full} lines={[["p50 (median)", format(row.p50)], ["p95", format(row.p95)], ["p99", format(row.p99)]]} /> : null;
            }}
          />
          <Line type="monotone" dataKey="p50" stroke={color} dot={false} strokeWidth={2} {...animation} />
          <Line type="monotone" dataKey="p95" stroke={P95_COLOR} dot={false} strokeWidth={1.5} {...animation} />
          <Line type="monotone" dataKey="p99" stroke={P99_COLOR} dot={false} strokeWidth={1.5} strokeDasharray="3 3" {...animation} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** How many checks fell in each value band; the last bar is everything above p99. */
export function DistributionChart({ bins, color, animate, format, formatAxis }: Formatters & { bins: HistogramBin[]; color: string; animate: boolean }) {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  const data = bins.map((bin) => ({
    label: bin.to === null ? `> ${formatAxis(bin.from)}` : `${formatAxis(bin.from)}`,
    range: bin.to === null ? `Above ${format(bin.from)}` : `${format(bin.from)} – ${format(bin.to)}`,
    count: bin.count,
  }));
  if (!total) return <EmptyLens message="Not enough variation in this range to show a distribution." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} interval={0} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
        <YAxis tick={AXIS_TICK} allowDecimals={false} width={40} axisLine={false} tickLine={false} />
        <Tooltip
          content={({ active, payload }) => {
            const row = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
            return row ? <TooltipBox heading={row.range} lines={[["Checks", `${row.count} (${Math.round((row.count / total) * 100)}%)`]]} /> : null;
          }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={32} {...animationProps(animate)}>
          {/* The last bin is "above p99"; flagged by position because row fields are spread onto the DOM by recharts. */}
          {data.map((entry, index) => <Cell key={entry.label} fill={index === data.length - 1 ? OUTLIER_COLOR : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyLens({ message }: { message: string }) {
  return <div className="grid h-full place-items-center text-center text-xs text-[var(--fg-dim)]">{message}</div>;
}

const originMs = Date.UTC(2000, 0, 1);

function cellColor(total: number, ok: number) {
  if (!total) return "var(--line)";
  const ratio = ok / total;
  if (ratio >= 0.999) return "#10b981";
  if (ratio >= 0.95) return "#f59e0b";
  return "#ef4444";
}

/** Uptime percentage with one colored cell per hour (24h) or day, including empty slots. */
export function UptimePanel({ insight, range, animate, formatDate }: {
  insight: RangeInsight;
  range: SeriesRangeId;
  animate: boolean;
  formatDate: (iso: string) => string;
}) {
  const checks = insight.checks;
  const slots = useMemo(() => {
    if (!checks) return [];
    const stride = SERIES_RANGES[range].cellSec * 1000;
    const byTime = new Map(checks.cells.map((cell) => [Date.parse(cell.t), cell]));
    const first = originMs + Math.floor((Date.parse(insight.start) - originMs) / stride) * stride;
    const last = Date.parse(insight.end);
    const result = [];
    for (let time = first; time < last; time += stride) {
      const cell = byTime.get(time);
      result.push({ time, iso: new Date(time).toISOString(), total: cell?.total ?? 0, ok: cell?.ok ?? 0 });
    }
    return result;
  }, [checks, insight.start, insight.end, range]);
  if (!checks || checks.uptimePct === null) return <EmptyLens message="No checks have run in this range." />;
  const total = checks.cells.reduce((sum, cell) => sum + cell.total, 0);
  const ok = checks.cells.reduce((sum, cell) => sum + cell.ok, 0);
  // Never round up to 100%: 99.996% must not read as perfect.
  const pct = checks.uptimePct >= 100 ? "100" : (Math.floor(checks.uptimePct * 100) / 100).toFixed(2);
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold tabular-nums text-[var(--fg)]">{pct}%</span>
        <span className="text-xs text-[var(--fg-dim)]">uptime · {ok.toLocaleString()} of {total.toLocaleString()} checks passed</span>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${slots.length > 40 ? 8 : 14}px, 1fr))` }} role="img" aria-label={`Uptime ${pct}%`}>
        {slots.map((slot, index) => (
          <motion.span
            key={slot.time}
            title={slot.total ? `${formatDate(slot.iso)} · ${((slot.ok / slot.total) * 100).toFixed(1)}% (${slot.total} checks)` : `${formatDate(slot.iso)} · no checks`}
            className="block h-7 rounded-[3px]"
            style={{ background: cellColor(slot.total, slot.ok) }}
            initial={animate ? { opacity: 0, scaleY: 0.3 } : false}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ delay: animate ? Math.min(index * 0.01, 0.6) : 0, duration: animate ? 0.3 : 0 }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-[var(--fg-dim)]">
        <span>{slots[0] ? formatDate(slots[0].iso) : ""}</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-[2px] bg-[#10b981]" />up</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-[2px] bg-[#f59e0b]" />some failures</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-[2px] bg-[#ef4444]" />down</span>
        </span>
        <span>now</span>
      </div>
    </div>
  );
}

const FAILURE_LABELS: Record<FailureKind, string> = {
  timeout: "Timeouts",
  dns: "DNS errors",
  tls: "TLS / certificate errors",
  refused: "Connection refused or reset",
  other: "Other failures",
};

function codeTone(code: number) {
  if (code >= 500) return "#ef4444";
  if (code >= 400) return "#f59e0b";
  if (code >= 300) return "#3b82f6";
  return "#10b981";
}

function BarList({ title, items, animate }: { title: string; items: { key: string; label: string; count: number; tone: string }[]; animate: boolean }) {
  const max = Math.max(...items.map((item) => item.count), 1);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="min-w-0 flex-1">
      <h5 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-dim)]">{title}</h5>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={item.key} className="text-xs">
            <div className="mb-0.5 flex justify-between gap-2 text-[var(--fg-soft)]">
              <span className="truncate">{item.label}</span>
              <span className="tabular-nums">{item.count.toLocaleString()} · {Math.round((item.count / total) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-[var(--line)]">
              <motion.div
                className="h-full"
                style={{ background: item.tone }}
                initial={animate ? { width: 0 } : false}
                animate={{ width: `${(item.count / max) * 100}%` }}
                transition={{ delay: animate ? index * 0.06 : 0, duration: animate ? 0.5 : 0, ease: "easeOut" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** HTTP status codes and generic failure types. Raw error messages are never shown. */
export function ResponsesPanel({ insight, animate }: { insight: RangeInsight; animate: boolean }) {
  const checks = insight.checks;
  if (!checks || (!checks.codes.length && !checks.failures.length)) return <EmptyLens message="No checks have run in this range." />;
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1 sm:flex-row">
      {checks.codes.length > 0 && (
        <BarList title="HTTP status codes" animate={animate} items={checks.codes.slice(0, 6).map((entry) => ({ key: String(entry.code), label: `HTTP ${entry.code}`, count: entry.count, tone: codeTone(entry.code) }))} />
      )}
      {checks.failures.length > 0 && (
        <BarList title="Failures without a response" animate={animate} items={checks.failures.map((entry) => ({ key: entry.kind, label: FAILURE_LABELS[entry.kind], count: entry.count, tone: "#ef4444" }))} />
      )}
    </div>
  );
}
