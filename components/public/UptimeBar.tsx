import { COMPONENT_STATUS_COLOR, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";

export function UptimeBar({
  days,
  uptimePct,
}: {
  days: { date: string; status: ComponentStatus; uptimePct: number | null }[];
  uptimePct: number | null;
}) {
  return (
    <div className="mt-2">
      <div className="flex gap-[2px] h-6 bg-[var(--bg)] p-[2px]">
        {days.map((d) => (
          <div
            key={d.date}
            title={
              d.uptimePct === null
                ? `${d.date}: No uptime data`
                : `${d.date}: ${COMPONENT_STATUS_LABEL[d.status]} (${d.uptimePct.toFixed(2)}% uptime)`
            }
            tabIndex={0}
            role="img"
            aria-label={
              d.uptimePct === null
                ? `${d.date}: No uptime data`
                : `${d.date}: ${COMPONENT_STATUS_LABEL[d.status]}, ${d.uptimePct.toFixed(2)}% uptime`
            }
            className="min-w-[3px] flex-1 rounded-sm outline-none transition-all hover:opacity-75 focus:-translate-y-1 focus:ring-2 focus:ring-[var(--fg)]"
            style={{
              backgroundColor:
                d.uptimePct === null ? "var(--line-bright)" : COMPONENT_STATUS_COLOR[d.status],
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] font-mono text-[var(--fg-dim)] mt-1.5">
        <span>{days.length} days ago</span>
        <span className="font-medium text-[var(--fg-soft)]">
          {uptimePct === null ? "No uptime data" : `${uptimePct.toFixed(2)}% uptime`}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}
