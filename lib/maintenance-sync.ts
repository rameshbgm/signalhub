import { prisma } from "@/lib/db";

/**
 * Opportunistically advances scheduled-maintenance lifecycle state based on
 * wall-clock time. Called on read paths (no background worker in this build)
 * so admins/visitors always see an up-to-date status even without a cron job.
 */
export async function syncAutoMaintenance() {
  const now = new Date();

  const toStart = await prisma.incident.findMany({
    where: { isMaintenance: true, autoTransition: true, maintenanceStatus: "SCHEDULED", scheduledStart: { lte: now } },
    include: { components: true },
  });
  for (const inc of toStart) {
    await prisma.incident.update({ where: { id: inc.id }, data: { maintenanceStatus: "IN_PROGRESS" } });
    for (const ic of inc.components) {
      await prisma.component.update({ where: { id: ic.componentId }, data: { status: ic.newStatus } });
    }
    await prisma.incidentUpdate.create({
      data: { incidentId: inc.id, status: "INVESTIGATING", body: "This scheduled maintenance window has started automatically." },
    });
  }

  const toComplete = await prisma.incident.findMany({
    where: { isMaintenance: true, autoTransition: true, maintenanceStatus: "IN_PROGRESS", scheduledEnd: { lte: now } },
    include: { components: true },
  });
  for (const inc of toComplete) {
    await prisma.incident.update({ where: { id: inc.id }, data: { maintenanceStatus: "COMPLETED", resolvedAt: now } });
    for (const ic of inc.components) {
      await prisma.component.update({ where: { id: ic.componentId }, data: { status: "OPERATIONAL" } });
    }
    await prisma.incidentUpdate.create({
      data: { incidentId: inc.id, status: "RESOLVED", body: "This scheduled maintenance window has completed automatically." },
    });
  }
}
