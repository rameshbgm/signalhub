"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { dispatchNotifications } from "@/lib/notify";

async function pageSlug(pageId: string) {
  return (await prisma.page.findUnique({ where: { id: pageId } }))?.slug;
}

export async function createIncident(formData: FormData) {
  const session = await requireOrgSession();
  const pageId = String(formData.get("pageId") ?? "");
  await assertPageInOrg(pageId, session.orgId);

  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "INVESTIGATING");
  const impact = String(formData.get("impact") ?? "MINOR");
  const body = String(formData.get("body") ?? "");
  const notify = formData.get("notify") === "on";
  const backfilled = formData.get("backfilled") === "on";
  const componentIds = formData.getAll("componentIds").map(String);
  const componentStatuses = componentIds.map((id) => String(formData.get(`componentStatus_${id}`) ?? "MAJOR_OUTAGE"));

  if (!name) throw new Error("Incident name is required");

  const incident = await prisma.incident.create({
    data: {
      pageId,
      name,
      status,
      impact,
      backfilled,
      notifySubscribers: notify,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
      components: { create: componentIds.map((id, i) => ({ componentId: id, newStatus: componentStatuses[i] })) },
      updates: { create: [{ status, body: body || `This incident has been created with status ${status}.`, notified: notify }] },
    },
  });

  for (let i = 0; i < componentIds.length; i++) {
    const compId = componentIds[i];
    const newStatus = componentStatuses[i];
    const comp = await prisma.component.findUnique({ where: { id: compId } });
    if (comp && comp.status !== newStatus) {
      await prisma.componentStatusEvent.updateMany({ where: { componentId: compId, endedAt: null }, data: { endedAt: new Date() } });
      await prisma.componentStatusEvent.create({ data: { componentId: compId, status: newStatus } });
    }
    await prisma.component.update({ where: { id: compId }, data: { status: newStatus } });
  }

  if (notify && !backfilled) {
    await dispatchNotifications({
      pageId,
      subject: `[Incident] ${name}`,
      body: body || `A new incident has been created: ${name}`,
      eventType: "incident.created",
      componentIds,
    });
  }

  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "CREATE_INCIDENT", target: incident.id } });

  revalidatePath("/admin/incidents");
  revalidatePath(`/${await pageSlug(pageId)}`);
  redirect(`/admin/incidents/${incident.id}`);
}

export async function postIncidentUpdate(incidentId: string, formData: FormData) {
  const session = await requireOrgSession();
  const incident = await prisma.incident.findUnique({ where: { id: incidentId }, include: { components: true } });
  if (!incident) throw new Error("Incident not found");
  await assertPageInOrg(incident.pageId, session.orgId);

  const status = String(formData.get("status") ?? incident.status);
  const body = String(formData.get("body") ?? "");
  const notify = formData.get("notify") === "on";

  await prisma.incidentUpdate.create({ data: { incidentId, status, body, notified: notify } });
  await prisma.incident.update({
    where: { id: incidentId },
    data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
  });

  if (status === "RESOLVED") {
    for (const ic of incident.components) {
      await prisma.componentStatusEvent.updateMany({ where: { componentId: ic.componentId, endedAt: null }, data: { endedAt: new Date() } });
      await prisma.componentStatusEvent.create({ data: { componentId: ic.componentId, status: "OPERATIONAL" } });
      await prisma.component.update({ where: { id: ic.componentId }, data: { status: "OPERATIONAL" } });
    }
  }

  if (notify) {
    await dispatchNotifications({
      pageId: incident.pageId,
      subject: `[${status}] ${incident.name}`,
      body,
      eventType: "incident.updated",
      componentIds: incident.components.map((c) => c.componentId),
    });
  }

  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "UPDATE_INCIDENT", target: incidentId } });

  revalidatePath(`/admin/incidents/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}

export async function deleteIncident(incidentId: string) {
  const session = await requireOrgSession();
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) throw new Error("Incident not found");
  await assertPageInOrg(incident.pageId, session.orgId);
  await prisma.incident.delete({ where: { id: incidentId } });
  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "DELETE_INCIDENT", target: incidentId } });
  revalidatePath("/admin/incidents");
  redirect("/admin/incidents");
}

export async function savePostmortem(incidentId: string, formData: FormData) {
  const session = await requireOrgSession();
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) throw new Error("Incident not found");
  await assertPageInOrg(incident.pageId, session.orgId);

  const publish = formData.get("publish") === "on";
  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      postmortemBody: String(formData.get("postmortemBody") ?? ""),
      postmortemPublishedAt: publish ? new Date() : null,
    },
  });

  if (publish) {
    await dispatchNotifications({
      pageId: incident.pageId,
      subject: `[Postmortem] ${incident.name}`,
      body: "A postmortem has been published for this incident.",
      eventType: "postmortem.published",
    });
  }

  revalidatePath(`/admin/incidents/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}
