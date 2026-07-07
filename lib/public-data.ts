import { prisma } from "@/lib/db";
import { overallBanner, type ComponentStatus } from "@/lib/status";

export async function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    include: {
      hubChildren: { orderBy: { createdAt: "asc" } },
      hubParent: true,
    },
  });
}

export async function getComponentsForPage(pageId: string, visibleIds: string[] | null) {
  const groups = await prisma.componentGroup.findMany({
    where: { pageId },
    orderBy: { order: "asc" },
    include: {
      components: {
        where: { visible: true, ...(visibleIds ? { id: { in: visibleIds } } : {}) },
        orderBy: { order: "asc" },
        include: { statusEvents: true },
      },
    },
  });

  const ungrouped = await prisma.component.findMany({
    where: { pageId, groupId: null, visible: true, ...(visibleIds ? { id: { in: visibleIds } } : {}) },
    orderBy: { order: "asc" },
    include: { statusEvents: true },
  });

  const allVisible = await prisma.component.findMany({
    where: { pageId, visible: true, ...(visibleIds ? { id: { in: visibleIds } } : {}) },
  });

  const banner = overallBanner(allVisible.map((c) => c.status as ComponentStatus));

  return { groups: groups.filter((g) => g.components.length > 0), ungrouped, allVisible, banner };
}

export async function getIncidentsForPage(pageId: string, componentIds?: string[] | null) {
  const incidents = await prisma.incident.findMany({
    where: {
      pageId,
      ...(componentIds ? { components: { some: { componentId: { in: componentIds } } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      updates: { orderBy: { createdAt: "asc" } },
      components: { include: { component: true } },
    },
  });
  return incidents;
}

export function splitActiveAndPast(incidents: Awaited<ReturnType<typeof getIncidentsForPage>>) {
  const active = incidents.filter((i) => {
    if (i.isMaintenance) return i.maintenanceStatus !== "COMPLETED";
    return i.status !== "RESOLVED";
  });
  const past = incidents.filter((i) => !active.includes(i));
  return { active, past };
}
