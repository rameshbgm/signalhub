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
    <div className="bg-white border rounded-lg p-4">
      <h4 className="text-sm font-semibold mb-2">
        {name} <span className="text-gray-400 font-normal">({suffix || "value"})</span>
      </h4>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={30} />
          <YAxis tick={{ fontSize: 10 }} width={40} />
          <Tooltip formatter={(v: number) => [`${v}${suffix}`, name]} />
          <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
