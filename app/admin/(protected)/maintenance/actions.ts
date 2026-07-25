"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import {
  createMaintenance as createMaintenanceDomain,
  deleteMaintenance as deleteMaintenanceDomain,
  transitionMaintenance,
} from "@/lib/domain/maintenance";
import { oid } from "@/lib/mongo-utils";
import { MAINTENANCE_STATUSES, type MaintenanceStatus } from "@/lib/status";
import { writeSupportMutationAudit } from "@/lib/support-audit";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

async function pageSlug(pageId: string) {
  return (await collections.pages().findOne({ _id: oid(pageId) }))?.slug;
}

export async function createMaintenance(formData: FormData) {
  const pageId = String(formData.get("pageId") ?? "");
  const session = await requireCapability("incident.manage", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const maintenance = await createMaintenanceDomain(session.orgId, {
    pageId,
    name: String(formData.get("name") ?? ""),
    body: String(formData.get("body") ?? ""),
    scheduledStart: new Date(String(formData.get("scheduledStart") ?? "")),
    scheduledEnd: new Date(String(formData.get("scheduledEnd") ?? "")),
    autoTransition: formData.get("autoTransition") === "on",
    notify: formData.get("notify") === "on",
    reminderMinutesBefore:
      formData.get("sendReminder") === "on"
        ? Number(formData.get("reminderMinutesBefore") ?? 60)
        : null,
    pageWide: formData.get("pageWide") === "on",
    componentIds: formData.getAll("componentIds").map(String),
  });
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "CREATE_MAINTENANCE",
    target: maintenance.id,
    supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
    createdAt: new Date(),
  });
  await writeSupportMutationAudit(session, {
    action: "CREATE_MAINTENANCE",
    targetType: "maintenance",
    targetId: maintenance.id,
    metadata: { pageId },
    tenantAuditExists: true,
  });
  revalidatePath("/admin/maintenance");
  revalidatePath(`/${await pageSlug(pageId)}`);
  redirect(`/admin/incidents/${maintenance.id}`);
}

export async function setMaintenanceStatus(incidentId: string, formData: FormData) {
  const session = await requireCapability("incident.update");
  const incident = await collections.incidents().findOne({ _id: oid(incidentId), isMaintenance: true });
  if (!incident) throw new Error("Maintenance not found");
  await assertPageInOrg(incident.pageId.toHexString(), session.orgId);
  const status = String(formData.get("maintenanceStatus") ?? "") as MaintenanceStatus;
  if (!MAINTENANCE_STATUSES.includes(status)) throw new Error("Invalid maintenance status");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("A maintenance update message is required");
  await transitionMaintenance({
    incidentId,
    status,
    body,
    notify: formData.get("notify") === "on",
  });
  await writeSupportMutationAudit(session, {
    action: "UPDATE_MAINTENANCE",
    targetType: "maintenance",
    targetId: incidentId,
    metadata: { pageId: incident.pageId.toHexString(), status },
  });
  revalidatePath(`/admin/incidents/${incidentId}`);
  revalidatePath(`/${await pageSlug(incident.pageId.toHexString())}`);
}

export async function deleteMaintenance(incidentId: string) {
  const session = await requireCapability("incident.manage");
  const incident = await collections.incidents().findOne({
    _id: oid(incidentId),
    isMaintenance: true,
  });
  if (!incident) throw new Error("Maintenance not found");
  await assertPageInOrg(incident.pageId.toHexString(), session.orgId);
  const slug = await pageSlug(incident.pageId.toHexString());
  const deleted = await deleteMaintenanceDomain(session.orgId, incidentId);
  if (!deleted) throw new Error("Maintenance not found");
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "DELETE_MAINTENANCE",
    target: incidentId,
    supportSessionId: session.supportSessionId
      ? oid(session.supportSessionId)
      : null,
    createdAt: new Date(),
  });
  await writeSupportMutationAudit(session, {
    action: "DELETE_MAINTENANCE",
    targetType: "maintenance",
    targetId: incidentId,
    metadata: { pageId: incident.pageId.toHexString() },
    tenantAuditExists: true,
  });
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/incidents");
  if (slug) revalidatePath(`/${slug}`);
  redirect("/admin/maintenance");
}
