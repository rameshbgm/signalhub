import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UptimeBar } from "../components/public/UptimeBar";
import { UPTIME_BAR_SIZES, UPTIME_BAR_STYLES, UPTIME_ICON_STYLES } from "../lib/page-design";

const days = [
  { date: "2026-07-24", status: "OPERATIONAL" as const, uptimePct: null, observedMs: 0, details: [] },
  { date: "2026-07-25", status: "OPERATIONAL" as const, uptimePct: 100, observedMs: 86_400_000, details: [] },
  {
    date: "2026-07-26",
    status: "DEGRADED_PERFORMANCE" as const,
    uptimePct: 82.59,
    observedMs: 86_400_000,
    details: [{
      status: "DEGRADED_PERFORMANCE" as const,
      note: "Elevated response times",
      startedAt: new Date("2026-07-26T01:00:00.000Z"),
      endedAt: new Date("2026-07-26T02:00:00.000Z"),
      durationMs: 3_600_000,
    }],
  },
];

describe("uptime bar styles", () => {
  it.each(UPTIME_BAR_STYLES)("renders the %s designer style", (style) => {
    const html = renderToStaticMarkup(
      <UptimeBar days={days} uptimePct={91.295} style={style} />
    );

    expect(html).toContain(`data-uptime-style="${style}"`);
    expect(html).toContain(style === "SOLID" ? "gap-0" : "gap-1.5");
  });

  it.each(UPTIME_BAR_SIZES)("renders the %s segment size preset", (size) => {
    const html = renderToStaticMarkup(<UptimeBar days={days} uptimePct={91.295} size={size} />);
    expect(html).toContain(`data-uptime-size="${size}"`);
  });

  it.each(UPTIME_ICON_STYLES)("renders the %s status icon preset", (iconStyle) => {
    const html = renderToStaticMarkup(<UptimeBar days={days} uptimePct={91.295} iconStyle={iconStyle} />);
    expect(html).toContain(`data-uptime-icon="${iconStyle}"`);
  });

  it("keeps the keyboard focus indicator inside each segment", () => {
    const html = renderToStaticMarkup(
      <UptimeBar days={days} uptimePct={91.295} />
    );

    expect(html).toContain("focus:ring-inset");
    expect(html).not.toContain("focus:-translate-y");
  });

  it("uses hover details for observed days and omits days without uptime data", () => {
    const html = renderToStaticMarkup(<UptimeBar days={days} uptimePct={91.295} />);

    expect(html).not.toContain("<button");
    expect(html).not.toContain("title=");
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(html).toContain("2026-07-25: Operational, 100.00% uptime");
    expect(html).toContain("2026-07-26: Degraded Performance, 82.59% uptime");
    expect(html).not.toContain("2026-07-24: Operational");
    expect(html).not.toContain("Open details");
  });

  it("uses the fixed semantic status palette", () => {
    const html = renderToStaticMarkup(<UptimeBar days={days} uptimePct={91.295} />);

    expect(html).toContain("background-color:#16a34a");
    expect(html).toContain("background-color:#eab308");
    expect(html).not.toContain("var(--status-operational)");
  });
});
