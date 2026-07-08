"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { dispatchNotifications } from "@/lib/notify";

async function pageSlug(pageId: string) {
  return (await prisma.page.findUnique({ where: { id: pageId } }))?.slug;
}

export async function createMaintenance(formData: FormData) {
  const session = await requireOrgSession();
  const pageId = String(formData.get("pageId") ?? "");
  await assertPageInOrg(pageId, session.orgId);

  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const scheduledStart = new Date(String(formData.get("scheduledStart") ?? ""));
  const scheduledEnd = new Date(String(formData.get("scheduledEnd") ?? ""));
  const autoTransition = formData.get("autoTransition") === "on";
  const notify = formData.get("notify") === "on";
  const componentIds = formData.getAll("componentIds").map(String);

  if (!name) throw new Error("Maintenance name is required");
  if (isNaN(scheduledStart.getTime()) || isNaN(scheduledEnd.getTime())) throw new Error("Valid start/end times are required");

  const incident = await prisma.incident.create({
    data: {
      pageId,
      name,
      status: "INVESTIGATING",
      impact: "NONE",
      isMaintenance: true,
      maintenanceStatus: "SCHEDULED",
      scheduledStart,
      scheduledEnd,
      autoTransition,
      components: { create: componentIds.map((id) => ({ componentId: id, newStatus: "UNDER_MAINTENANCE" })) },
      updates: { create: [{ status: "INVESTIGATING", body: body || `Scheduled maintenance: ${name}` }] },
    },
  });

  if (notify) {
    await dispatchNotifications({
      pageId,
      subject: `[Scheduled Maintenance] ${name}`,
      body: body || `Scheduled maintenance window: ${scheduledStart.toLocaleString()} - ${scheduledEnd.toLocaleString()}`,
      eventType: "maintenance.scheduled",
      componentIds,
    });
  }

  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "CREATE_MAINTENANCE", target: incident.id } });

  revalidatePath("/admin/maintenance");
  revalidatePath(`/${await pageSlug(pageId)}`);
  redirect(`/admin/incidents/${incident.id}`);
}

export async function setMaintenanceStatus(incidentId: string, formData: FormData) {
  const session = await requireOrgSession();
  const incident = await prisma.incident.findUnique({ where: { id: incidentId }, include: { components: true } });
  if (!incident) throw new Error("Not found");
  await assertPageInOrg(incident.pageId, session.orgId);

  const maintenanceStatus = String(formData.get("maintenanceStatus") ?? "SCHEDULED");
  const body = String(formData.get("body") ?? "");

  await prisma.incident.update({
    where: { id: incidentId },
    data: { maintenanceStatus, resolvedAt: maintenanceStatus === "COMPLETED" ? new Date() : null },
  });
  await prisma.incidentUpdate.create({ data: { incidentId, status: maintenanceStatus, body } });

  if (maintenanceStatus === "IN_PROGRESS") {
    for (const ic of incident.components) {
      await prisma.component.update({ where: { id: ic.componentId }, data: { status: ic.newStatus } });
    }
  }
  if (maintenanceStatus === "COMPLETED") {
    for (const ic of incident.components) {
      await prisma.component.update({ where: { id: ic.componentId }, data: { status: "OPERATIONAL" } });
    }
  }

  revalidatePath(`/admin/incidents/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}
