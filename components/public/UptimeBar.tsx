"use client";

import {
  Tooltip,
} from "@fluentui/react-components";
import { COMPONENT_STATUS_COLOR, COMPONENT_STATUS_LABEL, type ComponentStatus, type DailyUptimeBucket } from "@/lib/status";
import type { UptimeBarSize, UptimeBarStyle, UptimeIconStyle } from "@/lib/page-design";

export function UptimeBar({
  days,
  uptimePct,
  style = "ROUNDED",
  size = "RESPONSIVE",
  iconStyle = "NONE",
}: {
  days: DailyUptimeBucket[];
  uptimePct: number | null;
  style?: UptimeBarStyle;
  size?: UptimeBarSize;
  iconStyle?: UptimeIconStyle;
}) {
  const segmentRadius = style === "PILL"
    ? "!rounded-full"
    : style === "ROUNDED"
      ? "!rounded-sm"
      : "!rounded-none";
  const segmentSize = size === "COMPACT"
    ? "!h-5 !min-h-5 !w-1.5 !min-w-1.5 !max-w-1.5"
    : size === "BLOCKS"
      ? "!h-6 !min-h-6 !w-6 !min-w-6 !max-w-6"
      : "!h-12 !min-h-12 !w-full !min-w-0";
  const fixedSize = size !== "RESPONSIVE";
  const gap = style === "SOLID" ? "gap-0" : size === "RESPONSIVE" ? "gap-1.5" : "gap-1";

  return (
    <div className="mt-2 min-w-0 max-w-full">
      <div className={fixedSize ? "max-w-full overflow-x-auto pb-1" : ""}>
        <div
          data-uptime-grid
          data-uptime-style={style}
          data-uptime-size={size}
          data-uptime-icon={iconStyle}
          className={`${fixedSize ? "flex min-w-max" : "grid min-w-0 w-full"} ${gap} bg-[var(--bg)] p-[2px]`}
          style={fixedSize ? undefined : { gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}
        >
          {days.map((day) => {
            const label = day.uptimePct === null
              ? `${day.date}: No uptime data`
              : `${day.date}: ${COMPONENT_STATUS_LABEL[day.status]}, ${day.uptimePct.toFixed(2)}% uptime`;
            const hasInformation = day.uptimePct !== null;
            const segment = (
              <span
                tabIndex={hasInformation ? 0 : undefined}
                aria-label={hasInformation ? label : undefined}
                className={`${segmentSize} ${segmentRadius} inline-flex items-center justify-center outline-none transition-opacity ${hasInformation ? "cursor-help hover:opacity-80 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-[var(--fg)]" : ""}`}
                style={{
                  backgroundColor: day.uptimePct === null ? "var(--line-bright)" : statusColor(day.status),
                  color: contrastColor(day.status),
                }}
              >
                {indicator(day.status, iconStyle)}
              </span>
            );
            return hasInformation ? (
              <Tooltip
                key={day.date}
                relationship="description"
                positioning="above"
                withArrow
                showDelay={150}
                hideDelay={100}
                content={{ children: <DayDetails day={day} />, className: "!w-80 !max-w-[calc(100vw-2rem)] !p-5" }}
              >
                {segment}
              </Tooltip>
            ) : <span key={day.date} className="contents">{segment}</span>;
          })}
        </div>
      </div>
      <div className="mt-2 grid min-w-0 grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-3 text-[11px] font-mono text-[var(--fg-dim)]">
        <span>{days.length} days ago</span>
        <span aria-hidden="true" className="h-px bg-[var(--line-bright)]" />
        <span className="whitespace-nowrap text-center font-medium text-[var(--fg-soft)]">
          {uptimePct === null ? "No uptime data" : `${uptimePct.toFixed(2)}% uptime`}
        </span>
        <span aria-hidden="true" className="h-px bg-[var(--line-bright)]" />
        <span className="text-right">Today</span>
      </div>
    </div>
  );
}

function DayDetails({ day }: { day: DailyUptimeBucket }) {
  const notes = day.details.filter((detail) => detail.note);
  const affectedMs = day.details.reduce((total, detail) => total + detail.durationMs, 0);
  return (
    <div>
      <p className="text-base font-semibold text-[var(--fg)]">{formatDay(day.date)}</p>
      <div className="mt-4 flex items-center gap-3 bg-[var(--bg)] p-3">
        <span aria-hidden="true" className="text-xl" style={{ color: statusColor(day.status) }}>{statusSymbol(day.status)}</span>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm text-[var(--fg)]">{day.uptimePct === null ? "No uptime data" : COMPONENT_STATUS_LABEL[day.status]}</strong>
          {day.uptimePct !== null && <span className="mt-0.5 block text-xs text-[var(--fg-soft)]">{day.uptimePct.toFixed(2)}% uptime</span>}
        </div>
        {affectedMs > 0 && <span className="whitespace-nowrap text-sm font-semibold text-[var(--fg-soft)]">{formatDuration(affectedMs)}</span>}
      </div>
      {notes.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-dim)]">Related notes</p>
          <ul className="mt-2 space-y-2 text-sm text-[var(--fg)]">
            {notes.map((detail, index) => <li className="whitespace-pre-wrap" key={`${detail.startedAt.toISOString()}-${index}`}>{detail.note}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function indicator(status: ComponentStatus, iconStyle: UptimeIconStyle) {
  if (iconStyle === "NONE") return null;
  if (iconStyle === "DOT") return <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />;
  return <span aria-hidden="true" className="text-[9px] font-bold leading-none">{statusSymbol(status)}</span>;
}

function statusSymbol(status: ComponentStatus) {
  if (status === "OPERATIONAL") return "✓";
  if (status === "UNDER_MAINTENANCE") return "◆";
  if (status === "DEGRADED_PERFORMANCE") return "△";
  return "!";
}

function contrastColor(status: ComponentStatus) {
  return status === "DEGRADED_PERFORMANCE" ? "#1f2937" : "#ffffff";
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`));
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} hr${hours === 1 ? "" : "s"}`;
  return `${hours} hr${hours === 1 ? "" : "s"} ${minutes} min`;
}

function statusColor(status: ComponentStatus) {
  return COMPONENT_STATUS_COLOR[status];
}
