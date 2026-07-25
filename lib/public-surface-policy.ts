import type { ComponentStatus, Impact } from "@/lib/status";

export type IncidentIndicatorInput = {
  impact: string;
  isMaintenance: boolean;
  maintenanceStatus: string | null;
  status: string;
};

export function activeIncidentIndicator(
  incident: IncidentIndicatorInput
): ComponentStatus | null {
  if (incident.isMaintenance) {
    return incident.maintenanceStatus === "IN_PROGRESS" ||
      incident.maintenanceStatus === "VERIFYING"
      ? "UNDER_MAINTENANCE"
      : null;
  }
  if (incident.status === "RESOLVED") return null;
  const impactStatus: Record<Impact, ComponentStatus | null> = {
    NONE: null,
    MINOR: "DEGRADED_PERFORMANCE",
    MAJOR: "PARTIAL_OUTAGE",
    CRITICAL: "MAJOR_OUTAGE",
  };
  return impactStatus[incident.impact as Impact] ?? null;
}

/**
 * Notification delivery has no visitor credential to validate later. Only a
 * public child can therefore be rolled up to its hub subscribers safely.
 */
export function canNotifyHubSubscribersFromChild(child: {
  type: string;
  isHub: boolean;
}) {
  return !child.isHub && child.type === "PUBLIC";
}
