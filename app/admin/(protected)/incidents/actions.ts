"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import {
  addIncidentUpdate,
  createIncident as createIncidentDomain,
  deleteIncident as deleteIncidentDomain,
  incidentUpdateEditInputSchema,
} from "@/lib/domain/incidents";
import { dispatchNotifications } from "@/lib/notify";
import { oid, toId } from "@/lib/mongo-utils";
import type { ComponentStatus, Impact, IncidentStatus } from "@/lib/status";
import { writeSupportMutationAudit } from "@/lib/support-audit";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";
import { reconcileComponents } from "@/lib/component-status";

async function pageSlug(pageId: string) {
  return (await collections.pages().findOne({ _id: oid(pageId) }))?.slug;
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
      status: String(
        formData.get(`componentStatus_${componentId}`) ?? "MAJOR_OUTAGE"
      ) as ComponentStatus,
    })),
  });
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "CREATE_INCIDENT",
    target: incident.id,
    supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
    createdAt: new Date(),
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
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc) throw new Error("Incident not found");
  const incident = toId(incidentDoc);
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
    supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
    createdAt: new Date(),
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

export async function editIncidentUpdate(
  incidentId: string,
  updateId: string,
  formData: FormData
) {
  const session = await requireCapability("incident.update");
  const input = incidentUpdateEditInputSchema.parse({
    status: String(formData.get("status") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  const result = await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const incident = await collections.incidents().findOne(
      { _id: oid(incidentId), isMaintenance: false },
      { session: databaseSession }
    );
    const page = incident
      ? await collections.pages().findOne(
          { _id: incident.pageId, orgId: oid(session.orgId) },
          { session: databaseSession }
        )
      : null;
    if (!incident || !page) throw new Error("Incident not found in your organization");

    const update = await collections.incidentUpdates().findOne(
      { _id: oid(updateId), incidentId: incident._id },
      { session: databaseSession }
    );
    if (!update) throw new Error("Timeline update not found");
    const newest = await collections.incidentUpdates().findOne(
      { incidentId: incident._id },
      { session: databaseSession, sort: { createdAt: -1, _id: -1 } }
    );
    const changed = await collections.incidentUpdates().updateOne(
      { _id: update._id, incidentId: incident._id },
      {
        $set: {
          status: input.status,
          body: input.body,
          editedAt: new Date(),
          editedBy: oid(session.userId),
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Timeline update changed; reload and retry");

    if (newest?._id.equals(update._id)) {
      const changedIncident = await collections.incidents().updateOne(
        { _id: incident._id, pageId: page._id, isMaintenance: false },
        {
          $set: {
            status: input.status,
            resolvedAt: input.status === "RESOLVED" ? incident.resolvedAt ?? new Date() : null,
          },
        },
        { session: databaseSession }
      );
      if (!changedIncident.matchedCount) throw new Error("Incident changed; reload and retry");
      const links = await collections.incidentComponents()
        .find({ incidentId: incident._id }, { session: databaseSession })
        .toArray();
      await reconcileComponents(links.map((link) => link.componentId), databaseSession);
    }

    return {
      pageId: page._id.toHexString(),
      slug: page.slug,
      hubParentId: page.hubParentId?.toHexString() ?? null,
    };
  });

  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "EDIT_INCIDENT_UPDATE",
    target: incidentId,
    metadata: { updateId, pageId: result.pageId },
    supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
    createdAt: new Date(),
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
    const hub = await collections.pages().findOne({ _id: oid(result.hubParentId) });
    if (hub) revalidatePath(`/hub/${hub.slug}`, "layout");
  }
}

export async function deleteIncident(incidentId: string) {
  const session = await requireCapability("incident.manage");
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc) throw new Error("Incident not found");
  await assertPageInOrg(incidentDoc.pageId.toHexString(), session.orgId);
  if (incidentDoc.isMaintenance) throw new Error("Use the maintenance workflow for this record");
  await deleteIncidentDomain(session.orgId, incidentId);
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "DELETE_INCIDENT",
    target: incidentId,
    supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
    createdAt: new Date(),
  });
  await writeSupportMutationAudit(session, {
    action: "DELETE_INCIDENT",
    targetType: "incident",
    targetId: incidentId,
    metadata: { pageId: incidentDoc.pageId.toHexString() },
    tenantAuditExists: true,
  });
  revalidatePath("/organization/incidents");
  redirect("/organization/incidents");
}

export async function savePostmortem(incidentId: string, formData: FormData) {
  const session = await requireCapability("incident.manage");
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc) throw new Error("Incident not found");
  if (incidentDoc.isMaintenance) {
    throw new Error("Postmortems are only available for incidents");
  }
  const incident = toId(incidentDoc);
  await assertPageInOrg(incident.pageId, session.orgId);
  const body = String(formData.get("postmortemBody") ?? "").trim();
  const publish = formData.get("publish") === "on";
  const notify = formData.get("notify") === "on";
  if (publish && !body) throw new Error("A postmortem body is required before publishing");
  const publishedAt = publish ? new Date() : null;
  if (publish && incident.status !== "RESOLVED") {
    throw new Error("Resolve the incident before publishing its postmortem");
  }
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const currentIncident = await collections.incidents().findOne(
      {
        _id: incidentDoc._id,
        pageId: incidentDoc.pageId,
        isMaintenance: false,
      },
      { session: databaseSession }
    );
    const currentPage = currentIncident
      ? await collections.pages().findOne(
          {
            _id: currentIncident.pageId,
            orgId: oid(session.orgId),
          },
          { session: databaseSession }
        )
      : null;
    if (!currentIncident || !currentPage) {
      throw new Error("Incident not found");
    }
    if (publish && currentIncident.status !== "RESOLVED") {
      throw new Error("Resolve the incident before publishing its postmortem");
    }
    const changed = await collections.incidents().updateOne(
      { _id: currentIncident._id, pageId: currentPage._id },
      {
        $set: {
          postmortemBody: body || null,
          postmortemPublishedAt: publishedAt,
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) {
      throw new Error("Incident state changed; reload and retry");
    }
    if (publish && notify) {
      const links = await collections
        .incidentComponents()
        .find(
          { incidentId: currentIncident._id },
          { session: databaseSession }
        )
        .toArray();
      await dispatchNotifications(
        {
          pageId: currentPage._id.toHexString(),
          subject: `[Postmortem] ${currentIncident.name}`,
          body: "A postmortem has been published for this incident.",
          eventType: "postmortem.published",
          eventId: `${incidentId}:${publishedAt!.toISOString()}`,
          componentIds: currentIncident.pageWide
            ? []
            : links.map((link) => link.componentId.toHexString()),
        },
        databaseSession
      );
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
