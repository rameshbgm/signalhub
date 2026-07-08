"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { dispatchNotifications } from "@/lib/notify";
import { deleteIncidentCascade } from "@/lib/cascade";

async function pageSlug(pageId: string) {
  return (await collections.pages().findOne({ _id: oid(pageId) }))?.slug;
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

  const incidentId = new ObjectId();
  await collections.incidents().insertOne({
    _id: incidentId,
    pageId: oid(pageId),
    name,
    status,
    impact,
    isMaintenance: false,
    maintenanceStatus: null,
    scheduledStart: null,
    scheduledEnd: null,
    autoTransition: false,
    notifySubscribers: notify,
    postmortemBody: null,
    postmortemPublishedAt: null,
    createdAt: new Date(),
    resolvedAt: status === "RESOLVED" ? new Date() : null,
    backfilled,
  });
  if (componentIds.length) {
    await collections.incidentComponents().insertMany(
      componentIds.map((id, i) => ({ _id: new ObjectId(), incidentId, componentId: oid(id), newStatus: componentStatuses[i] }))
    );
  }
  await collections.incidentUpdates().insertOne({
    _id: new ObjectId(),
    incidentId,
    status,
    body: body || `This incident has been created with status ${status}.`,
    createdAt: new Date(),
    notified: notify,
  });

  for (let i = 0; i < componentIds.length; i++) {
    const compId = componentIds[i];
    const newStatus = componentStatuses[i];
    const compDoc = await collections.components().findOne({ _id: oid(compId) });
    if (compDoc && compDoc.status !== newStatus) {
      await collections.componentStatusEvents().updateMany(
        { componentId: oid(compId), endedAt: null },
        { $set: { endedAt: new Date() } }
      );
      await collections.componentStatusEvents().insertOne({
        _id: new ObjectId(),
        componentId: oid(compId),
        status: newStatus,
        startedAt: new Date(),
        endedAt: null,
        isMaintenance: false,
      });
    }
    await collections.components().updateOne({ _id: oid(compId) }, { $set: { status: newStatus } });
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

  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "CREATE_INCIDENT",
    target: incidentId.toHexString(),
    createdAt: new Date(),
  });

  revalidatePath("/admin/incidents");
  revalidatePath(`/${await pageSlug(pageId)}`);
  redirect(`/admin/incidents/${incidentId.toHexString()}`);
}

export async function postIncidentUpdate(incidentId: string, formData: FormData) {
  const session = await requireOrgSession();
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc) throw new Error("Incident not found");
  const incident = toId(incidentDoc);
  await assertPageInOrg(incident.pageId, session.orgId);
  const linkedComponents = await collections.incidentComponents().find({ incidentId: oid(incidentId) }).toArray();

  const status = String(formData.get("status") ?? incident.status);
  const body = String(formData.get("body") ?? "");
  const notify = formData.get("notify") === "on";

  await collections.incidentUpdates().insertOne({
    _id: new ObjectId(),
    incidentId: oid(incidentId),
    status,
    body,
    createdAt: new Date(),
    notified: notify,
  });
  await collections.incidents().updateOne(
    { _id: oid(incidentId) },
    { $set: { status, resolvedAt: status === "RESOLVED" ? new Date() : null } }
  );

  if (status === "RESOLVED") {
    for (const ic of linkedComponents) {
      await collections.componentStatusEvents().updateMany(
        { componentId: ic.componentId, endedAt: null },
        { $set: { endedAt: new Date() } }
      );
      await collections.componentStatusEvents().insertOne({
        _id: new ObjectId(),
        componentId: ic.componentId,
        status: "OPERATIONAL",
        startedAt: new Date(),
        endedAt: null,
        isMaintenance: false,
      });
      await collections.components().updateOne({ _id: ic.componentId }, { $set: { status: "OPERATIONAL" } });
    }
  }

  if (notify) {
    await dispatchNotifications({
      pageId: incident.pageId,
      subject: `[${status}] ${incident.name}`,
      body,
      eventType: "incident.updated",
      componentIds: linkedComponents.map((c) => c.componentId.toHexString()),
    });
  }

  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "UPDATE_INCIDENT",
    target: incidentId,
    createdAt: new Date(),
  });

  revalidatePath(`/admin/incidents/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}

export async function deleteIncident(incidentId: string) {
  const session = await requireOrgSession();
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc) throw new Error("Incident not found");
  const incident = toId(incidentDoc);
  await assertPageInOrg(incident.pageId, session.orgId);
  await deleteIncidentCascade(incidentId);
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "DELETE_INCIDENT",
    target: incidentId,
    createdAt: new Date(),
  });
  revalidatePath("/admin/incidents");
  redirect("/admin/incidents");
}

export async function savePostmortem(incidentId: string, formData: FormData) {
  const session = await requireOrgSession();
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc) throw new Error("Incident not found");
  const incident = toId(incidentDoc);
  await assertPageInOrg(incident.pageId, session.orgId);

  const publish = formData.get("publish") === "on";
  await collections.incidents().updateOne(
    { _id: oid(incidentId) },
    {
      $set: {
        postmortemBody: String(formData.get("postmortemBody") ?? ""),
        postmortemPublishedAt: publish ? new Date() : null,
      },
    }
  );

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
