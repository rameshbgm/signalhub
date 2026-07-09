"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function MetricChart({
  name,
  suffix,
  points,
  color,
}: {
  name: string;
  suffix: string;
  points: { timestamp: string; value: number }[];
  color: string;
}) {
  const data = points.map((p) => ({
    t: new Date(p.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    value: Math.round(p.value * 100) / 100,
  }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h4 className="text-sm font-display font-semibold mb-3 text-gray-900">
        {name} <span className="text-gray-400 font-normal font-sans">({suffix || "value"})</span>
      </h4>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={30} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={40} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v: number) => [`${v}${suffix}`, name]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
