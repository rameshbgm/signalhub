"use client";

import { ChartArea, ChartCandlestick, ChartColumn, ChartLine, ChartNoAxesCombined, ChartScatter, Gauge, Grid3x3, type LucideIcon } from "lucide-react";
import type { MetricLens, MetricRange, MetricView } from "@/lib/page-design";

// Each view has its own icon color so the buttons are told apart at a glance; the hues read on light and dark pages.
export const VIEWS: readonly { id: MetricView; label: string; icon: LucideIcon; tone: string }[] = [
  { id: "line", label: "Line", icon: ChartLine, tone: "#3b82f6" },
  { id: "area", label: "Area", icon: ChartArea, tone: "#06b6d4" },
  { id: "bar", label: "Bars", icon: ChartColumn, tone: "#f59e0b" },
  { id: "step", label: "Step", icon: ChartNoAxesCombined, tone: "#10b981" },
  { id: "scatter", label: "Scatter", icon: ChartScatter, tone: "#ec4899" },
  { id: "bands", label: "Min / avg / max", icon: ChartCandlestick, tone: "#8b5cf6" },
  { id: "gauge", label: "Gauge", icon: Gauge, tone: "#ef4444" },
  { id: "heatmap", label: "Heatmap", icon: Grid3x3, tone: "#f97316" },
];

export const LENS_LABELS: Record<MetricLens, string> = {
  trend: "Trend",
  percentiles: "Percentiles",
  distribution: "Distribution",
  uptime: "Uptime",
  responses: "Responses",
};

export const RANGE_LABELS: Record<MetricRange, string> = { "24h": "24h", "7d": "7d", "30d": "30d", "90d": "90d" };

/** Height of the plot area; identical in every lens so the card does not jump. */
export const CHART_HEIGHT = 180;
export const ANIMATION_MS = 700;
/** Scatter marks samples above the series average with this color so outliers stand out. */
export const OUTLIER_COLOR = "#f59e0b";
export const P95_COLOR = "#f59e0b";
export const P99_COLOR = "#ef4444";
export const AXIS_TICK = { fontSize: 10, fill: "var(--fg-dim)" } as const;

/** A row of the trend series as the charts consume it. */
export type TrendRow = {
  index: number;
  t: string;
  full: string;
  value: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  prev?: number;
};

export function TooltipBox({ heading, lines }: { heading?: string; lines: [string, string][] }) {
  return (
    <div className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--fg)] shadow-lg" style={{ borderRadius: "var(--page-radius, 8px)" }}>
      {heading && <div className="mb-1 text-[var(--fg-soft)]">{heading}</div>}
      {lines.map(([label, value]) => <div key={label}>{label}: <span className="font-semibold tabular-nums">{value}</span></div>)}
    </div>
  );
}
