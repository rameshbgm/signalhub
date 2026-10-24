"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { themeVariables } from "@/components/public/theme-variables";
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
  const gap = style === "SOLID" ? "gap-0" : size === "RESPONSIVE" ? "gap-1 sm:gap-1.5" : "gap-1";
  // Ninety bars cannot fit a phone-width card, so small screens show the last 30 days.
  const mobileDays = Math.min(days.length, MOBILE_DAYS);

  const tooltipId = useId();
  const [active, setActive] = useState<{ day: DailyUptimeBucket; rect: DOMRect; theme: CSSProperties } | null>(null);

  // A fixed tooltip would drift from its bar while scrolling, so hide it.
  useEffect(() => {
    if (!active) return;
    const hide = () => setActive(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [active]);

  return (
    <div className="mt-2 min-w-0 max-w-full">
      <div className={fixedSize ? "max-w-full overflow-x-auto pb-1" : ""}>
        <div
          data-uptime-grid
          data-uptime-style={style}
          data-uptime-size={size}
          data-uptime-icon={iconStyle}
          className={`${fixedSize ? "flex min-w-max" : "grid min-w-0 w-full grid-cols-[repeat(var(--uptime-days),minmax(0,1fr))] max-sm:grid-cols-[repeat(var(--uptime-mobile-days),minmax(0,1fr))]"} ${gap} bg-[var(--bg)] p-[2px]`}
          style={fixedSize ? undefined : { "--uptime-days": Math.max(days.length, 1), "--uptime-mobile-days": Math.max(mobileDays, 1) } as CSSProperties}
          onMouseLeave={() => setActive(null)}
        >
          {days.map((day, index) => {
            const label = day.uptimePct === null
              ? `${day.date}: No uptime data`
              : `${day.date}: ${COMPONENT_STATUS_LABEL[day.status]}, ${day.uptimePct.toFixed(2)}% uptime`;
            const hasInformation = day.uptimePct !== null;
            const show = (element: HTMLElement) => setActive({ day, rect: element.getBoundingClientRect(), theme: themeVariables(element) });
            return (
              <span
                key={day.date}
                tabIndex={hasInformation ? 0 : undefined}
                aria-label={hasInformation ? label : undefined}
                aria-describedby={hasInformation && active?.day.date === day.date ? tooltipId : undefined}
                onMouseEnter={hasInformation ? (event) => show(event.currentTarget) : () => setActive(null)}
                onFocus={hasInformation ? (event) => show(event.currentTarget) : undefined}
                onBlur={() => setActive(null)}
                onKeyDown={(event) => { if (event.key === "Escape") setActive(null); }}
                className={`${!fixedSize && index < days.length - mobileDays ? "max-sm:hidden" : ""} ${segmentSize} ${segmentRadius} inline-flex items-center justify-center outline-none transition-[opacity,transform] ${hasInformation ? "cursor-help hover:opacity-80 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-[var(--fg)]" : ""} ${active?.day.date === day.date ? "opacity-80" : ""}`}
                style={{
                  backgroundColor: day.uptimePct === null ? "var(--line-bright)" : statusColor(day.status),
                  color: contrastColor(day.status),
                }}
              >
                {indicator(day.status, iconStyle)}
              </span>
            );
          })}
        </div>
      </div>
      {/* Portaled to <body>: a transformed card ancestor would otherwise become
          the containing block and misplace or clip a fixed tooltip. */}
      {active && createPortal(<DayTooltip id={tooltipId} day={active.day} anchor={active.rect} theme={active.theme} />, document.body)}
      <div className="mt-2 grid min-w-0 grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-3 text-[11px] font-mono text-[var(--fg-dim)]">
        <span>
          <span className="sm:hidden">{mobileDays} days ago</span>
          <span className="max-sm:hidden">{days.length} days ago</span>
        </span>
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

const MOBILE_DAYS = 30;
const TOOLTIP_WIDTH = 288;
const VIEWPORT_MARGIN = 12;

/**
 * Positioned against the viewport (not the card), so it is never clipped by
 * the card's rounded overflow and flips below the bar near the top edge.
 * The page theme variables are copied from the bar, since it renders in <body>.
 */
function DayTooltip({ id, day, anchor, theme }: { id: string; day: DailyUptimeBucket; anchor: DOMRect; theme: CSSProperties }) {
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const width = Math.min(TOOLTIP_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const center = anchor.left + anchor.width / 2;
  const left = Math.min(Math.max(center - width / 2, VIEWPORT_MARGIN), viewportWidth - width - VIEWPORT_MARGIN);
  const placeAbove = anchor.top > 190;
  const arrowLeft = Math.min(Math.max(center - left, 14), width - 14);
  const position: CSSProperties = placeAbove
    ? { left, width, bottom: window.innerHeight - anchor.top + 10 }
    : { left, width, top: anchor.bottom + 10 };
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[2100] border border-[var(--line-bright)] bg-[var(--surface)] p-4 text-[var(--fg)] shadow-[0_12px_32px_rgb(15_23_42/0.18)]"
      style={{ ...theme, ...position, borderRadius: "calc(var(--page-radius, 10px) + 2px)" }}
    >
      <span
        aria-hidden="true"
        className="absolute size-3 rotate-45 border-[var(--line-bright)] bg-[var(--surface)]"
        style={placeAbove
          ? { left: arrowLeft - 6, bottom: -7, borderRightWidth: 1, borderBottomWidth: 1 }
          : { left: arrowLeft - 6, top: -7, borderLeftWidth: 1, borderTopWidth: 1 }}
      />
      <DayDetails day={day} />
    </div>
  );
}

function DayDetails({ day }: { day: DailyUptimeBucket }) {
  const notes = day.details.filter((detail) => detail.note);
  const affectedMs = day.details.reduce((total, detail) => total + detail.durationMs, 0);
  return (
    <div>
      <p className="text-sm font-semibold text-[var(--fg)]">{formatDay(day.date)}</p>
      <div className="mt-3 flex items-center gap-3 rounded-[var(--page-radius,8px)] bg-[var(--bg)] px-3 py-2.5">
        <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: statusColor(day.status), color: contrastColor(day.status) }}>{statusSymbol(day.status)}</span>
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
