"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { assertIncidentEditAllowed, assertTimelineEditAllowed, editIncidentInputSchema } from "@/lib/incident-validation";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { reconcileComponents } from "@/lib/component-status";
import {
  addIncidentUpdate,
  createIncident as createIncidentDomain,
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
  revalidatePath("/organization/events");
  revalidatePath(`/${await pageSlug(pageId)}`);
  redirect(`/organization/events/${incident.id}`);
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
  revalidatePath(`/organization/events/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}

export async function editIncidentUpdate(incidentId: string, updateId: string, formData: FormData) {
  const session = await requireCapability("incident.update");
  const input = incidentUpdateEditInputSchema.parse({
    status: String(formData.get("status") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  const scoped = await database.selectFrom("incidents").select("pageId")
    .where("id", "=", incidentId).executeTakeFirst();
  if (!scoped) throw new Error("Incident not found in your organization");
  await assertPageInOrg(scoped.pageId, session.orgId);
  const result = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const incident = await transaction.selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select(["incident.id", "incident.name", "incident.impact", "incident.pageWide", "incident.backfilled", "incident.status", "incident.resolvedAt", "page.id as pageId", "page.slug", "page.hubParentId"])
      .where("incident.id", "=", incidentId).where("incident.isMaintenance", "=", false)
      .where("page.orgId", "=", session.orgId).forUpdate("incident").executeTakeFirst();
    if (!incident) throw new Error("Incident not found in your organization");
    const update = await transaction.selectFrom("incidentUpdates").select(["id", "status", "body", "editedAt"])
      .where("id", "=", updateId).where("incidentId", "=", incident.id).executeTakeFirst();
    if (!update) throw new Error("Timeline update not found");
    const newest = await transaction.selectFrom("incidentUpdates").select("id")
      .where("incidentId", "=", incident.id).orderBy("createdAt", "desc").orderBy("id", "desc")
      .executeTakeFirst();
    assertTimelineEditAllowed(incident.status, update.status, input.status, newest?.id === update.id);
    if (String(formData.get("expectedEditedAt") ?? "") !== (update.editedAt?.toISOString() ?? "")) throw new Error("This timeline entry was edited by another operator. Reload before saving your correction.");
    if (update.status === input.status && update.body === input.body) return { pageId: incident.pageId, slug: incident.slug, hubParentId: incident.hubParentId };
    if (newest?.id === update.id) {
      const links = await transaction.selectFrom("incidentComponents").selectAll()
        .where("incidentId", "=", incident.id).execute();
      const validation = editIncidentInputSchema.safeParse({
        pageId: incident.pageId, name: incident.name, body: input.body, status: input.status,
        impact: incident.impact, pageWide: incident.pageWide, backfilled: incident.backfilled, notify: false,
        components: links.map((link) => ({ componentId: link.componentId, status: link.newStatus })),
      });
      if (!validation.success) throw new Error(validation.error.issues.map((issue) => issue.message).join(". "));
    }
    await transaction.updateTable("incidentUpdates").set({
      status: input.status,
      body: input.body,
      editedAt: new Date(),
      editedBy: session.userId,
    }).where("id", "=", update.id).execute();
    if (newest?.id === update.id && incident.status !== "RESOLVED") {
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
  revalidatePath(`/organization/events/${incidentId}`);
  revalidatePath(`/${result.slug}`, "layout");
  if (result.hubParentId) {
    const hub = await database.selectFrom("pages").select("slug")
      .where("id", "=", result.hubParentId).executeTakeFirst();
    if (hub) revalidatePath(`/hub/${hub.slug}`, "layout");
  }
}

/** Corrects the incident and its latest public update in one page-scoped transaction. */
export async function editIncidentDetails(incidentId: string, formData: FormData) {
  const session = await requireCapability("incident.manage");
  const scoped = await database.selectFrom("incidents").select("pageId")
    .where("id", "=", incidentId).where("isMaintenance", "=", false).executeTakeFirst();
  if (!scoped) throw new Error("Incident not found");
  await assertPageInOrg(scoped.pageId, session.orgId);
  const componentIds = formData.getAll("componentIds").map(String);
  const input = editIncidentInputSchema.parse({
    pageId: scoped.pageId,
    name: String(formData.get("name") ?? ""),
    status: String(formData.get("status") ?? ""),
    impact: String(formData.get("impact") ?? ""),
    body: String(formData.get("body") ?? ""),
    notify: formData.get("notify") === "on",
    backfilled: formData.get("backfilled") === "on",
    pageWide: formData.get("pageWide") === "on",
    components: componentIds.map((componentId) => ({
      componentId,
      status: String(formData.get(`componentStatus_${componentId}`) ?? "MAJOR_OUTAGE"),
    })),
  });
  const result = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const incident = await transaction.selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select(["incident.id", "incident.name", "incident.impact", "incident.backfilled", "incident.notifySubscribers", "incident.publicVisible", "incident.pageId", "incident.status", "incident.pageWide", "incident.resolvedAt", "page.slug", "page.hubParentId"])
      .where("incident.id", "=", incidentId).where("incident.isMaintenance", "=", false)
      .where("page.orgId", "=", session.orgId).where("page.deletedAt", "is", null)
      .forUpdate("incident").executeTakeFirst();
    if (!incident) throw new Error("Incident not found in your organization");
    if (input.components.length) {
      const valid = await transaction.selectFrom("components").select("id")
        .where("pageId", "=", incident.pageId)
        .where("id", "in", input.components.map((component) => component.componentId)).execute();
      if (valid.length !== input.components.length) throw new Error("One or more services do not belong to this page");
    }
    const previous = await transaction.selectFrom("incidentComponents").select(["componentId", "newStatus"])
      .where("incidentId", "=", incident.id).execute();
    if (input.notify && incident.publicVisible === false) throw new Error("Restore the incident to the public page before notifying subscribers");
    assertIncidentEditAllowed({ status: incident.status, impact: incident.impact, backfilled: incident.backfilled, pageWide: incident.pageWide, components: previous.map((link) => ({ componentId: link.componentId, status: link.newStatus })) }, input);
    const latest = await transaction.selectFrom("incidentUpdates").select(["id", "status", "body", "notified", "editedAt"])
      .where("incidentId", "=", incident.id).orderBy("createdAt", "desc").orderBy("id", "desc")
      .forUpdate().executeTakeFirst();
    if (!latest) throw new Error("Incident has no update to edit");
    if (String(formData.get("latestUpdateId") ?? "") !== latest.id) throw new Error("A new incident update was posted. Reload before editing the incident.");
    if (String(formData.get("expectedEditedAt") ?? "") !== (latest.editedAt?.toISOString() ?? "")) throw new Error("This incident was edited by another operator. Reload before saving your correction.");
    const editedAt = new Date();
    if (incident.status === "RESOLVED") {
      // A prose correction must not rewrite lifecycle fields, delivery history, links, or service health.
      if (incident.name !== input.name) await transaction.updateTable("incidents").set({ name: input.name }).where("id", "=", incident.id).execute();
      if (incident.name !== input.name || latest.body !== input.body) await transaction.updateTable("incidentUpdates").set({
        body: input.body, editedAt, editedBy: session.userId,
      }).where("id", "=", latest.id).execute();
    } else {
      await transaction.updateTable("incidents").set({
        name: input.name, status: input.status, impact: input.impact, pageWide: input.pageWide,
        resolvedAt: input.status === "RESOLVED" ? incident.resolvedAt ?? editedAt : null,
      }).where("id", "=", incident.id).execute();
      await transaction.updateTable("incidentUpdates").set({
        status: input.status, body: input.body, notified: latest.notified || (input.notify && !input.backfilled), editedAt, editedBy: session.userId,
      }).where("id", "=", latest.id).execute();
      await transaction.deleteFrom("incidentComponents").where("incidentId", "=", incident.id).execute();
      if (input.components.length) await transaction.insertInto("incidentComponents").values(
        input.components.map((component) => ({ incidentId: incident.id, componentId: component.componentId, newStatus: component.status }))
      ).execute();
      await reconcileComponents(new Set([...previous.map((link) => link.componentId), ...input.components.map((component) => component.componentId)]), transaction);
    }
    if (input.notify && !input.backfilled) {
      await dispatchNotifications({
        pageId: incident.pageId,
        subject: `[Incident update] ${input.name}`,
        body: input.body,
        eventType: input.status === "RESOLVED" ? "incident.resolved" : "incident.updated",
        eventId: `${latest.id}:edit:${editedAt.getTime()}`,
        correlationId: incident.id,
        componentIds: input.pageWide ? [] : input.components.map((component) => component.componentId),
      }, transaction);
    }
    return { pageId: incident.pageId, slug: incident.slug, hubParentId: incident.hubParentId };
  });
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "EDIT_INCIDENT",
    target: incidentId,
    metadata: { pageId: result.pageId, notified: input.notify && !input.backfilled },
    supportSessionId: session.supportSessionId ?? null,
  });
  await writeSupportMutationAudit(session, {
    action: "EDIT_INCIDENT", targetType: "incident", targetId: incidentId,
    metadata: { pageId: result.pageId, notified: input.notify && !input.backfilled }, tenantAuditExists: true,
  });
  revalidatePath(`/organization/events/${incidentId}`);
  revalidatePath(`/${result.slug}`, "layout");
  if (result.hubParentId) {
    const hub = await database.selectFrom("pages").select("slug")
      .where("id", "=", result.hubParentId).executeTakeFirst();
    if (hub) revalidatePath(`/hub/${hub.slug}`, "layout");
  }
}

/** Kept as a rejection for stale clients: incidents cannot be permanently deleted. */
export async function deleteIncident(_incidentId: string) {
  await requireCapability("incident.manage");
  throw new Error("Incidents cannot be deleted. Hide the incident from the public page instead.");
}

export async function setIncidentPublicVisibility(incidentId: string, publicVisible: boolean) {
  const session = await requireCapability("incident.manage");
  if (typeof publicVisible !== "boolean") throw new Error("Invalid incident visibility");
  const scoped = await database.selectFrom("incidents").select("pageId")
    .where("id", "=", incidentId).where("isMaintenance", "=", false).executeTakeFirst();
  if (!scoped) throw new Error("Incident not found");
  await requireCapability("incident.manage", scoped.pageId);
  await assertPageInOrg(scoped.pageId, session.orgId);
  const page = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const incident = await transaction.selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select(["incident.id", "page.id as pageId", "page.slug", "page.hubParentId"])
      .where("incident.id", "=", incidentId).where("incident.isMaintenance", "=", false)
      .where("page.orgId", "=", session.orgId).where("page.deletedAt", "is", null)
      .forUpdate("incident").executeTakeFirst();
    if (!incident) throw new Error("Incident not found in your organization");
    await transaction.updateTable("incidents").set({ publicVisible })
      .where("id", "=", incident.id).execute();
    return incident;
  });
  const action = publicVisible ? "UNHIDE_INCIDENT" : "HIDE_INCIDENT";
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email, action, target: incidentId,
    metadata: { pageId: page.pageId, publicVisible }, supportSessionId: session.supportSessionId ?? null,
  });
  await writeSupportMutationAudit(session, {
    action, targetType: "incident", targetId: incidentId,
    metadata: { pageId: page.pageId, publicVisible }, tenantAuditExists: true,
  });
  revalidatePath("/organization/events");
  revalidatePath(`/organization/events/${incidentId}`);
  revalidatePath(`/organization/pages/${page.pageId}`, "layout");
  revalidatePath(`/${page.slug}`, "layout");
  if (page.hubParentId) {
    const hub = await database.selectFrom("pages").select("slug").where("id", "=", page.hubParentId).executeTakeFirst();
    if (hub) revalidatePath(`/hub/${hub.slug}`, "layout");
  }
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
  if (body.length > INPUT_LIMITS.postmortem) throw new Error(`Postmortems must be ${INPUT_LIMITS.postmortem.toLocaleString("en-US")} characters or fewer`);
  if (publish && !body) throw new Error("A postmortem body is required before publishing");
  if (publish && incident.status !== "RESOLVED") throw new Error("Resolve the incident before publishing its postmortem");
  let firstPublish = false;
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const current = await transaction.selectFrom("incidents as incident")
      .innerJoin("pages as page", "page.id", "incident.pageId")
      .select(["incident.id", "incident.name", "incident.status", "incident.pageWide", "incident.postmortemPublishedAt", "incident.publicVisible", "page.id as pageId"])
      .where("incident.id", "=", incident.id).where("incident.isMaintenance", "=", false)
      .where("page.orgId", "=", session.orgId).forUpdate("incident").executeTakeFirst();
    if (!current) throw new Error("Incident not found");
    if (publish && current.status !== "RESOLVED") throw new Error("Resolve the incident before publishing its postmortem");
    if (publish && notify && current.publicVisible === false) throw new Error("Restore the incident to the public page before notifying subscribers about its postmortem");
    firstPublish = publish && !current.postmortemPublishedAt;
    await transaction.updateTable("incidents").set({
      postmortemBody: body || null,
      // Edits to a published postmortem keep its original publication time.
      postmortemPublishedAt: publish ? current.postmortemPublishedAt ?? new Date() : null,
    }).where("id", "=", current.id).execute();
    // Subscribers hear about a postmortem once, when it is first published.
    if (firstPublish && notify) {
      const links = await transaction.selectFrom("incidentComponents").select("componentId")
        .where("incidentId", "=", current.id).execute();
      await dispatchNotifications({
        pageId: current.pageId,
        subject: `[Postmortem] ${current.name}`,
        body,
        eventType: "postmortem.published",
        eventId: `${incidentId}:postmortem`,
        correlationId: current.id,
        componentIds: current.pageWide ? [] : links.map((link) => link.componentId),
      }, transaction);
    }
  });
  await writeSupportMutationAudit(session, {
    action: publish ? "PUBLISH_POSTMORTEM" : "SAVE_POSTMORTEM",
    targetType: "incident",
    targetId: incidentId,
    metadata: { pageId: incident.pageId, notified: firstPublish && notify },
  });
  revalidatePath(`/organization/events/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId)}`);
}
