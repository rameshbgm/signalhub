import type { PageDoc } from "@/lib/db";
import { getComponentsForPage, getIncidentsForPage } from "@/lib/public-data";
import { publicPagePath } from "@/lib/public-path";

export async function buildStatusPayload(
  page: PageDoc,
  visibleComponentIds: string[] | null,
  publicUrl?: string
) {
  const pageId = page._id.toHexString();
  const [{ allVisible, banner }, incidents] = await Promise.all([
    getComponentsForPage(pageId, visibleComponentIds),
    getIncidentsForPage(pageId, visibleComponentIds),
  ]);
  const activeIncidents = incidents.filter(
    (incident) => !incident.isMaintenance && incident.status !== "RESOLVED"
  );
  const activeMaintenance = incidents.filter(
    (incident) =>
      incident.isMaintenance &&
      (incident.maintenanceStatus === "IN_PROGRESS" || incident.maintenanceStatus === "VERIFYING")
  );
  const scheduledMaintenance = incidents.filter(
    (incident) => incident.isMaintenance && incident.maintenanceStatus === "SCHEDULED"
  );

  const affected = (incident: (typeof incidents)[number]) =>
    incident.components
      .map((link) => link.component?.name)
      .filter((name): name is string => Boolean(name));
  const latestUpdate = (incident: (typeof incidents)[number]) =>
    incident.updates.at(-1)?.body ?? null;
  const maintenancePayload = (incident: (typeof incidents)[number]) => ({
    id: incident.id,
    name: incident.name,
    status: incident.maintenanceStatus,
    scheduled_start: incident.scheduledStart,
    scheduled_end: incident.scheduledEnd,
    affected_components: affected(incident),
    page_wide: incident.pageWide,
  });

  return {
    page: {
      name: page.name,
      slug: page.slug,
      url:
        publicUrl ??
        `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}${publicPagePath(page)}`,
    },
    status: { indicator: banner.status, description: banner.label },
    components: allVisible.map((component) => ({
      id: component.id,
      name: component.name,
      status: component.status,
    })),
    active_incidents: activeIncidents.map((incident) => ({
      id: incident.id,
      name: incident.name,
      status: incident.status,
      impact: incident.impact,
      created_at: incident.createdAt,
      latest_update: latestUpdate(incident),
      affected_components: affected(incident),
      page_wide: incident.pageWide,
    })),
    active_maintenance: activeMaintenance.map(maintenancePayload),
    scheduled_maintenance: scheduledMaintenance.map(maintenancePayload),
  };
}
