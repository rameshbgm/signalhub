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

/**
 * Services a visitor's new subscription may cover. An empty list means "all
 * services" to the notifier, so a scoped visitor with nothing visible must be
 * refused instead of silently subscribed to everything. Hubs have no services.
 */
export function resolveSubscriptionScope(
  visibleComponentIds: string[] | null,
  requestedComponentIds: string[],
  isHub = false
): { ok: true; componentIds: string[] } | { ok: false } {
  if (visibleComponentIds === null) return { ok: true, componentIds: requestedComponentIds };
  if (!isHub && visibleComponentIds.length === 0) return { ok: false };
  if (requestedComponentIds.some((id) => !visibleComponentIds.includes(id))) return { ok: false };
  return { ok: true, componentIds: requestedComponentIds.length ? requestedComponentIds : visibleComponentIds };
}

/**
 * Clamps an existing subscription to what a visitor may still see. Returns
 * null when nothing is left, meaning the subscription should be removed.
 */
export function narrowSubscriberScope(subscriberComponentIds: string[], allowedComponentIds: string[]): string[] | null {
  if (allowedComponentIds.length === 0) return null;
  if (subscriberComponentIds.length === 0) return allowedComponentIds;
  const kept = subscriberComponentIds.filter((id) => allowedComponentIds.includes(id));
  return kept.length ? kept : null;
}
