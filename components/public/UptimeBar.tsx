import { COMPONENT_STATUS_COLOR, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";

export function UptimeBar({
  days,
  uptimePct,
}: {
  days: { date: string; status: ComponentStatus; uptimePct: number }[];
  uptimePct: number;
}) {
  return (
    <div className="mt-2">
      <div className="flex gap-[2px] h-6">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${COMPONENT_STATUS_LABEL[d.status]} (${d.uptimePct}% uptime)`}
            className="flex-1 rounded-sm hover:opacity-75 transition-opacity"
            style={{ backgroundColor: COMPONENT_STATUS_COLOR[d.status] }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-gray-400 mt-1.5">
        <span>{days.length} days ago</span>
        <span className="font-medium text-gray-500">{uptimePct.toFixed(2)}% uptime</span>
        <span>Today</span>
      </div>
    </div>
  );
}
