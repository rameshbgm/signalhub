"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { reconcileComponents } from "@/lib/component-status";
import {
  addIncidentUpdate,
  createIncident as createIncidentDomain,
  deleteIncident as deleteIncidentDomain,
  incidentUpdateEditInputSchema,
} from "@/lib/domain/incidents";
import { dispatchNotifications } from "@/lib/notify";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { ComponentStatus, Impact, IncidentStatus } from "@/lib/status";
import { writeSupportMutationAudit } from "@/lib/support-audit";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

async function pageSlug(pageId: string) {
  return (await database.selectFrom("pages").select("slug").where("id", "=", pageId).executeTakeFirst())?.slug;
}

export async function createIncident(formData: FormData) {
  const pageId = String(formData.get("pageId") ?? "");
  const session = await requireCapability("incident.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const componentIds = formData.getAll("componentIds").map(String);
  const incident = await createIncidentDomain(session.orgId, {
    pageId,
    name: String(formData.get("name") ?? ""),
    status: String(formData.get("status") ?? "INVESTIGATING") as IncidentStatus,
    impact: String(formData.get("impact") ?? "MINOR") as Impact,
    body: String(formData.get("body") ?? ""),
    notify: formData.get("notify") === "on",
    backfilled: formData.get("backfilled") === "on",
    pageWide: formData.get("pageWide") === "on",
    components: componentIds.map((componentId) => ({
      componentId,
      status: String(formData.get(`componentStatus_${componentId}`) ?? "MAJOR_OUTAGE") as ComponentStatus,
    })),
  });
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "CREATE_INCIDENT",
    target: incident.id,
    supportSessionId: session.supportSessionId ?? null,
  });
  await writeSupportMutationAudit(session, {
    action: "CREATE_INCIDENT",
    targetType: "incident",
    targetId: incident.id,
    metadata: { pageId },
    tenantAuditExists: true,
  });
  revalidatePath("/organization/incidents");
  revalidatePath(`/${await pageSlug(pageId)}`);
  redirect(`/organization/incidents/${incident.id}`);
}

export async function postIncidentUpdate(incidentId: string, formData: FormData) {
  const session = await requireCapability("incident.update");
  const incident = await database.selectFrom("incidents").select(["pageId", "status"])
    .where("id", "=", incidentId).executeTakeFirst();
  if (!incident) throw new Error("Incident not found");
  await assertPageInOrg(incident.pageId, session.orgId);
  await addIncidentUpdate(session.orgId, incidentId, {
    status: String(formData.get("status") ?? incident.status) as IncidentStatus,
    body: String(formData.get("body") ?? ""),
    notify: formData.get("notify") === "on",
  });
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "UPDATE_INCIDENT",
    target: incidentId,
    supportSessionId: session.supportSessionId ?? null,
  });
  await writeSupportMutationAudit(session, {
    action: "UPDATE_INCIDENT",
    targetType: "incident",
    targetId: incidentId,
    metadata: { pageId: incident.pageId },
    tenantAuditExists: true,
  });
  revalidatePath(`/organization/incidents/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}

export async function editIncidentUpdate(incidentId: string, updateId: string, formData: FormData) {
  const session = await requireCapability("incident.update");
  const input = incidentUpdateEditInputSchema.parse({
    status: String(formData.get("status") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  const result = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const incident = await transaction.selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select(["incident.id", "incident.resolvedAt", "page.id as pageId", "page.slug", "page.hubParentId"])
      .where("incident.id", "=", incidentId).where("incident.isMaintenance", "=", false)
      .where("page.orgId", "=", session.orgId).forUpdate("incident").executeTakeFirst();
    if (!incident) throw new Error("Incident not found in your organization");
    const update = await transaction.selectFrom("incidentUpdates").select("id")
      .where("id", "=", updateId).where("incidentId", "=", incident.id).executeTakeFirst();
    if (!update) throw new Error("Timeline update not found");
    const newest = await transaction.selectFrom("incidentUpdates").select("id")
      .where("incidentId", "=", incident.id).orderBy("createdAt", "desc").orderBy("id", "desc")
      .executeTakeFirst();
    await transaction.updateTable("incidentUpdates").set({
      status: input.status,
      body: input.body,
      editedAt: new Date(),
      editedBy: session.userId,
    }).where("id", "=", update.id).execute();
    if (newest?.id === update.id) {
      await transaction.updateTable("incidents").set({
        status: input.status,
        resolvedAt: input.status === "RESOLVED" ? incident.resolvedAt ?? new Date() : null,
      }).where("id", "=", incident.id).execute();
      const links = await transaction.selectFrom("incidentComponents").select("componentId")
        .where("incidentId", "=", incident.id).execute();
      await reconcileComponents(links.map((link) => link.componentId), transaction);
    }
    return { pageId: incident.pageId, slug: incident.slug, hubParentId: incident.hubParentId };
  });

  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "EDIT_INCIDENT_UPDATE",
    target: incidentId,
    metadata: { updateId, pageId: result.pageId },
    supportSessionId: session.supportSessionId ?? null,
  });
  await writeSupportMutationAudit(session, {
    action: "EDIT_INCIDENT_UPDATE",
    targetType: "incident_update",
    targetId: updateId,
    metadata: { incidentId, pageId: result.pageId },
    tenantAuditExists: true,
  });
  revalidatePath(`/organization/incidents/${incidentId}`);
  revalidatePath(`/${result.slug}`, "layout");
  if (result.hubParentId) {
    const hub = await database.selectFrom("pages").select("slug")
      .where("id", "=", result.hubParentId).executeTakeFirst();
    if (hub) revalidatePath(`/hub/${hub.slug}`, "layout");
  }
}

export async function deleteIncident(incidentId: string) {
  const session = await requireCapability("incident.manage");
  const incident = await database.selectFrom("incidents").select(["pageId", "isMaintenance"])
    .where("id", "=", incidentId).executeTakeFirst();
  if (!incident) throw new Error("Incident not found");
  await assertPageInOrg(incident.pageId, session.orgId);
  if (incident.isMaintenance) throw new Error("Use the maintenance workflow for this record");
  await deleteIncidentDomain(session.orgId, incidentId);
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "DELETE_INCIDENT",
    target: incidentId,
    supportSessionId: session.supportSessionId ?? null,
  });
  await writeSupportMutationAudit(session, {
    action: "DELETE_INCIDENT",
    targetType: "incident",
    targetId: incidentId,
    metadata: { pageId: incident.pageId },
    tenantAuditExists: true,
  });
  revalidatePath("/organization/incidents");
  redirect("/organization/incidents");
}

export async function savePostmortem(incidentId: string, formData: FormData) {
  const session = await requireCapability("incident.manage");
  const incident = await database.selectFrom("incidents").selectAll()
    .where("id", "=", incidentId).executeTakeFirst();
  if (!incident) throw new Error("Incident not found");
  if (incident.isMaintenance) throw new Error("Postmortems are only available for incidents");
  await assertPageInOrg(incident.pageId, session.orgId);
  const body = String(formData.get("postmortemBody") ?? "").trim();
  const publish = formData.get("publish") === "on";
  const notify = formData.get("notify") === "on";
  if (publish && !body) throw new Error("A postmortem body is required before publishing");
  if (publish && incident.status !== "RESOLVED") throw new Error("Resolve the incident before publishing its postmortem");
  const publishedAt = publish ? new Date() : null;
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const current = await transaction.selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select(["incident.id", "incident.name", "incident.status", "incident.pageWide", "page.id as pageId"])
      .where("incident.id", "=", incident.id).where("incident.isMaintenance", "=", false)
      .where("page.orgId", "=", session.orgId).forUpdate("incident").executeTakeFirst();
    if (!current) throw new Error("Incident not found");
    if (publish && current.status !== "RESOLVED") throw new Error("Resolve the incident before publishing its postmortem");
    await transaction.updateTable("incidents").set({
      postmortemBody: body || null,
      postmortemPublishedAt: publishedAt,
    }).where("id", "=", current.id).execute();
    if (publish && notify) {
      const links = await transaction.selectFrom("incidentComponents").select("componentId")
        .where("incidentId", "=", current.id).execute();
      await dispatchNotifications({
        pageId: current.pageId,
        subject: `[Postmortem] ${current.name}`,
        body: "A postmortem has been published for this incident.",
        eventType: "postmortem.published",
        eventId: `${incidentId}:${publishedAt!.toISOString()}`,
        componentIds: current.pageWide ? [] : links.map((link) => link.componentId),
      }, transaction);
    }
  });
  await writeSupportMutationAudit(session, {
    action: publish ? "PUBLISH_POSTMORTEM" : "SAVE_POSTMORTEM",
    targetType: "incident",
    targetId: incidentId,
    metadata: { pageId: incident.pageId, notified: publish && notify },
  });
  revalidatePath(`/organization/incidents/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}
