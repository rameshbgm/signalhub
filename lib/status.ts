export const COMPONENT_STATUSES = [
  "OPERATIONAL",
  "DEGRADED_PERFORMANCE",
  "PARTIAL_OUTAGE",
  "MAJOR_OUTAGE",
  "UNDER_MAINTENANCE",
] as const;

export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

export const INCIDENT_STATUSES = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const MAINTENANCE_STATUSES = ["SCHEDULED", "IN_PROGRESS", "VERIFYING", "COMPLETED"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const IMPACTS = ["NONE", "MINOR", "MAJOR", "CRITICAL"] as const;
export type Impact = (typeof IMPACTS)[number];

export const COMPONENT_STATUS_LABEL: Record<ComponentStatus, string> = {
  OPERATIONAL: "Operational",
  DEGRADED_PERFORMANCE: "Degraded Performance",
  PARTIAL_OUTAGE: "Partial Outage",
  MAJOR_OUTAGE: "Major Outage",
  UNDER_MAINTENANCE: "Under Maintenance",
};

export const COMPONENT_STATUS_COLOR: Record<ComponentStatus, string> = {
  OPERATIONAL: "#0a9d58",
  DEGRADED_PERFORMANCE: "#f4c20d",
  PARTIAL_OUTAGE: "#e8710a",
  MAJOR_OUTAGE: "#d93025",
  UNDER_MAINTENANCE: "#2f80ed",
};

// Higher = worse. Used to compute the "worst" status across components/days.
const SEVERITY_RANK: Record<ComponentStatus, number> = {
  OPERATIONAL: 0,
  UNDER_MAINTENANCE: 1,
  DEGRADED_PERFORMANCE: 2,
  PARTIAL_OUTAGE: 3,
  MAJOR_OUTAGE: 4,
};

export function worstStatus(statuses: ComponentStatus[]): ComponentStatus {
  if (statuses.length === 0) return "OPERATIONAL";
  return statuses.reduce((worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst), "OPERATIONAL" as ComponentStatus);
}

export function overallBanner(statuses: ComponentStatus[]): { label: string; color: string; status: ComponentStatus } {
  const worst = worstStatus(statuses);
  if (worst === "OPERATIONAL") {
    return { label: "All Systems Operational", color: COMPONENT_STATUS_COLOR.OPERATIONAL, status: worst };
  }
  if (worst === "UNDER_MAINTENANCE") {
    return { label: "Maintenance In Progress", color: COMPONENT_STATUS_COLOR.UNDER_MAINTENANCE, status: worst };
  }
  const labels: Partial<Record<ComponentStatus, string>> = {
    DEGRADED_PERFORMANCE: "Degraded Performance",
    PARTIAL_OUTAGE: "Partial System Outage",
    MAJOR_OUTAGE: "Major System Outage",
  };
  return { label: labels[worst] ?? "Service Disruption", color: COMPONENT_STATUS_COLOR[worst], status: worst };
}

export const IMPACT_COLOR: Record<Impact, string> = {
  NONE: "#6b7280",
  MINOR: "#f4c20d",
  MAJOR: "#e8710a",
  CRITICAL: "#d93025",
};

export const IMPACT_LABEL: Record<Impact, string> = {
  NONE: "No Impact",
  MINOR: "Minor Outage",
  MAJOR: "Major Outage",
  CRITICAL: "Critical Outage",
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  INVESTIGATING: "Investigating",
  IDENTIFIED: "Identified",
  MONITORING: "Monitoring",
  RESOLVED: "Resolved",
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  VERIFYING: "Verifying",
  COMPLETED: "Completed",
};

/**
 * Compute per-day uptime percentage buckets from a list of status events.
 * Maintenance windows are excluded from downtime math per spec.
 */
export function computeDailyUptime(
  events: { status: string; startedAt: Date; endedAt: Date | null; isMaintenance: boolean }[],
  days: number
): { date: string; status: ComponentStatus; uptimePct: number }[] {
  const now = new Date();
  const result: { date: string; status: ComponentStatus; uptimePct: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    dayStart.setUTCDate(dayStart.getUTCDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    let downMs = 0;
    let worst: ComponentStatus = "OPERATIONAL";

    for (const ev of events) {
      if (ev.isMaintenance) continue;
      const evStart = ev.startedAt < dayStart ? dayStart : ev.startedAt;
      const evEnd = (ev.endedAt ?? now) > dayEnd ? dayEnd : ev.endedAt ?? now;
      if (evEnd <= evStart) continue;
      if (ev.status === "OPERATIONAL") continue;
      downMs += evEnd.getTime() - evStart.getTime();
      const s = ev.status as ComponentStatus;
      if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
    }

    const dayMs = dayEnd.getTime() - dayStart.getTime();
    const uptimePct = dayStart > now ? 100 : Math.max(0, 100 - (downMs / dayMs) * 100);

    result.push({
      date: dayStart.toISOString().slice(0, 10),
      status: worst,
      uptimePct: Math.round(uptimePct * 100) / 100,
    });
  }

  return result;
}
