"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { dispatchNotifications } from "@/lib/notify";

async function pageSlug(pageId: string) {
  return (await collections.pages().findOne({ _id: oid(pageId) }))?.slug;
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

  const incidentId = new ObjectId();
  await collections.incidents().insertOne({
    _id: incidentId,
    pageId: oid(pageId),
    name,
    status: "INVESTIGATING",
    impact: "NONE",
    isMaintenance: true,
    maintenanceStatus: "SCHEDULED",
    scheduledStart,
    scheduledEnd,
    autoTransition,
    notifySubscribers: true,
    postmortemBody: null,
    postmortemPublishedAt: null,
    createdAt: new Date(),
    resolvedAt: null,
    backfilled: false,
  });
  if (componentIds.length) {
    await collections.incidentComponents().insertMany(
      componentIds.map((id) => ({ _id: new ObjectId(), incidentId, componentId: oid(id), newStatus: "UNDER_MAINTENANCE" }))
    );
  }
  await collections.incidentUpdates().insertOne({
    _id: new ObjectId(),
    incidentId,
    status: "INVESTIGATING",
    body: body || `Scheduled maintenance: ${name}`,
    createdAt: new Date(),
    notified: false,
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

  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "CREATE_MAINTENANCE",
    target: incidentId.toHexString(),
    createdAt: new Date(),
  });

  revalidatePath("/admin/maintenance");
  revalidatePath(`/${await pageSlug(pageId)}`);
  redirect(`/admin/incidents/${incidentId.toHexString()}`);
}

export async function setMaintenanceStatus(incidentId: string, formData: FormData) {
  const session = await requireOrgSession();
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc) throw new Error("Not found");
  const incident = toId(incidentDoc);
  await assertPageInOrg(incident.pageId, session.orgId);

  const maintenanceStatus = String(formData.get("maintenanceStatus") ?? "SCHEDULED");
  const body = String(formData.get("body") ?? "");

  await collections.incidents().updateOne(
    { _id: oid(incidentId) },
    { $set: { maintenanceStatus, resolvedAt: maintenanceStatus === "COMPLETED" ? new Date() : null } }
  );
  await collections.incidentUpdates().insertOne({
    _id: new ObjectId(),
    incidentId: oid(incidentId),
    status: maintenanceStatus,
    body,
    createdAt: new Date(),
    notified: false,
  });

  const components = await collections.incidentComponents().find({ incidentId: oid(incidentId) }).toArray();
  if (maintenanceStatus === "IN_PROGRESS") {
    for (const ic of components) {
      await collections.components().updateOne({ _id: ic.componentId }, { $set: { status: ic.newStatus } });
    }
  }
  if (maintenanceStatus === "COMPLETED") {
    for (const ic of components) {
      await collections.components().updateOne({ _id: ic.componentId }, { $set: { status: "OPERATIONAL" } });
    }
  }

  revalidatePath(`/admin/incidents/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}
