import { describe, expect, it } from "vitest";
import {
  overallBanner,
  worstStatus,
  computeDailyUptime,
  pageHealthStatus,
  weightedUptime,
  formatMetricValue,
} from "../lib/status";

describe("status domain helpers", () => {
  it("returns the most severe component status", () => {
    expect(worstStatus([])).toBe("OPERATIONAL");
    expect(worstStatus(["DEGRADED_PERFORMANCE", "MAJOR_OUTAGE"])).toBe("MAJOR_OUTAGE");
    expect(overallBanner(["UNDER_MAINTENANCE"]).label).toBe("Maintenance In Progress");
  });

  it("excludes maintenance windows from uptime calculations", () => {
    const now = new Date("2026-01-02T12:00:00.000Z");
    const events = [
      {
        status: "MAJOR_OUTAGE",
        startedAt: new Date("2026-01-02T00:00:00.000Z"),
        endedAt: new Date("2026-01-02T02:00:00.000Z"),
        isMaintenance: false,
      },
      {
        status: "UNDER_MAINTENANCE",
        startedAt: new Date("2026-01-02T02:00:00.000Z"),
        endedAt: new Date("2026-01-02T04:00:00.000Z"),
        isMaintenance: true,
      },
    ];
    const [day] = computeDailyUptime(events, 1, now);
    expect(day.status).toBe("MAJOR_OUTAGE");
    expect(day.uptimePct).toBeCloseTo((10 / 12) * 100, 2);
  });

  it("marks pre-creation days unknown and measures only observed component time", () => {
    const now = new Date("2026-01-03T12:00:00.000Z");
    const createdAt = new Date("2026-01-03T06:00:00.000Z");
    const days = computeDailyUptime(
      [
        {
          status: "MAJOR_OUTAGE",
          startedAt: new Date("2026-01-03T06:00:00.000Z"),
          endedAt: new Date("2026-01-03T08:00:00.000Z"),
          isMaintenance: false,
        },
      ],
      2,
      now,
      createdAt
    );

    expect(days[0]).toMatchObject({ uptimePct: null, observedMs: 0 });
    expect(days[1].uptimePct).toBeCloseTo((4 / 6) * 100, 2);
    expect(days[1].observedMs).toBe(6 * 60 * 60 * 1000);
    expect(weightedUptime(days)).toBeCloseTo((4 / 6) * 100, 2);
  });

  it("includes public status notes in their matching uptime-day details", () => {
    const now = new Date("2026-01-03T12:00:00.000Z");
    const [day] = computeDailyUptime([
      {
        status: "PARTIAL_OUTAGE",
        startedAt: new Date("2026-01-03T06:00:00.000Z"),
        endedAt: new Date("2026-01-03T08:30:00.000Z"),
        isMaintenance: false,
        note: "Elevated API errors",
      },
    ], 1, now);

    expect(day.details).toHaveLength(1);
    expect(day.details[0]).toMatchObject({
      status: "PARTIAL_OUTAGE",
      note: "Elevated API errors",
      durationMs: 2.5 * 60 * 60 * 1000,
    });
  });

  it("derives page health from components, incidents, maintenance, and monitors", () => {
    expect(
      pageHealthStatus({
        componentStatuses: [],
        activeIncidentImpacts: [],
        maintenanceActive: false,
        downMonitorStatuses: [],
      })
    ).toBeNull();
    expect(
      pageHealthStatus({
        componentStatuses: ["OPERATIONAL"],
        activeIncidentImpacts: ["MAJOR"],
        maintenanceActive: true,
        downMonitorStatuses: ["MAJOR_OUTAGE"],
      })
    ).toBe("MAJOR_OUTAGE");
  });

  it("formats metric values using configured decimal precision", () => {
    expect(formatMetricValue(12.345, 0)).toBe("12");
    expect(formatMetricValue(12.345, 2)).toBe("12.35");
    expect(formatMetricValue(12.5, 3)).toBe("12.500");
  });
});
