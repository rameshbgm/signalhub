"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatMetricValue, metricDecimals } from "@/lib/status";
import { formatPageDate } from "@/lib/page-locale";

export function MetricChart({
  name,
  suffix,
  points,
  color,
  decimals,
  locale = "en",
  timeZone = "UTC",
}: {
  name: string;
  suffix: string;
  points: { timestamp: string; value: number }[];
  color: string;
  decimals: number;
  locale?: string;
  timeZone?: string;
}) {
  const precision = metricDecimals(decimals);
  const data = points.map((p) => ({
    t: formatPageDate(p.timestamp, {
      language: locale,
      timeZone,
      month: "short",
      day: "numeric",
    }),
    value: Number(formatMetricValue(p.value, precision)),
  }));

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] p-5">
      <h4 className="text-sm font-mono font-semibold mb-3 text-[var(--fg)]">
        {name} <span className="text-[var(--fg-dim)] font-normal">({suffix || "value"})</span>
      </h4>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "var(--fg-dim)" }} minTickGap={30} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--fg-dim)" }}
            tickFormatter={(value: number) => formatMetricValue(value, precision)}
            width={56}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v: number) => [`${formatMetricValue(v, precision)}${suffix}`, name]}
            contentStyle={{ borderRadius: 0, border: "1px solid var(--line-bright)", background: "var(--surface-raised)", fontSize: 12, color: "var(--fg)" }}
            labelStyle={{ color: "var(--fg-soft)" }}
          />
          <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
