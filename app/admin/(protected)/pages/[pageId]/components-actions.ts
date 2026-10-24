"use server";

import { sql } from "kysely";
import { revalidatePath } from "next/cache";
import {
  requireCapability,
  assertPageInOrg,
  assertComponentInPage,
  assertGroupInPage,
} from "@/lib/admin-guard";
import { deleteComponentCascade } from "@/lib/cascade";
import { reconcileComponentStatus, setComponentStatus } from "@/lib/component-status";
import { isDatabaseId } from "@/lib/database-id";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { publicPagePath } from "@/lib/public-path";
import { COMPONENT_STATUSES, type ComponentStatus } from "@/lib/status";
import { generateAutomationToken } from "@/lib/tokens";

async function assertStatusPage(pageId: string, orgId: string) {
  const page = await database.selectFrom("pages").selectAll()
    .where("id", "=", pageId).where("orgId", "=", orgId).where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!page) throw new Error("Page not found in your organization");
  if (page.isHub) throw new Error("Services belong to status pages, not hubs");
  return page;
}

/**
 * Public pages are cached between visits, so every service or group change must
 * refresh the public page (and its hub) as well as the admin screens.
 */
async function revalidatePageSurfaces(page: { id: string; slug: string; isHub: boolean; hubParentId: string | null }) {
  revalidatePath(`/organization/pages/${page.id}`, "layout");
  revalidatePath(publicPagePath(page), "layout");
  if (page.hubParentId) {
    const hub = await database.selectFrom("pages").select("slug").where("id", "=", page.hubParentId).executeTakeFirst();
    if (hub) revalidatePath(publicPagePath({ slug: hub.slug, isHub: true }), "layout");
  }
}

export type GroupResult =
  | { ok: true; group: { id: string; name: string } }
  | { ok: false; error: string };

export async function createGroup(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a group name" } satisfies GroupResult;
  if (name.length > 120) return { ok: false, error: "Group names must be 120 characters or fewer" } satisfies GroupResult;
  const group = await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const duplicate = await transaction.selectFrom("componentGroups").select("id")
      .where("pageId", "=", pageId).where(sql<string>`lower(name)`, "=", name.toLowerCase()).executeTakeFirst();
    if (duplicate) return null;
    const orderRow = await transaction.selectFrom("componentGroups")
      .select(sql<number>`coalesce(max("order"), -1) + 1`.as("nextOrder"))
      .where("pageId", "=", pageId).executeTakeFirstOrThrow();
    return transaction.insertInto("componentGroups").values({
      pageId,
      name,
      description: "",
      order: Number(orderRow.nextOrder),
      collapsed: false,
    }).returning(["id", "name"]).executeTakeFirstOrThrow();
  });
  if (!group) return { ok: false, error: `A group named "${name}" already exists` } satisfies GroupResult;
  await revalidatePageSurfaces(page);
  return { ok: true, group } satisfies GroupResult;
}

export async function deleteGroup(pageId: string, groupId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  await assertGroupInPage(groupId, pageId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const removed = await transaction.deleteFrom("componentGroups")
      .where("id", "=", groupId).where("pageId", "=", pageId)
      .returning("id").executeTakeFirst();
    if (!removed) throw new Error("Component group changed; reload and retry");
  });
  await revalidatePageSurfaces(page);
  return { ok: true } as const;
}

export async function createComponent(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  const groupId = String(formData.get("groupId") ?? "") || null;
  if (groupId) await assertGroupInPage(groupId, pageId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Service name is required");
  if (name.length > 120) throw new Error("Service names must be 120 characters or fewer");
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 1_000) throw new Error("Descriptions must be 1,000 characters or fewer");
  const statusSource = String(formData.get("statusSource") ?? "MANUAL");
  if (!["MANUAL", "AUTOMATIC"].includes(statusSource)) throw new Error("Choose automatic or manual status");
  const monitorId = String(formData.get("monitorId") ?? "");
  if (statusSource === "AUTOMATIC") {
    await requireCapability("monitor.manage", pageId);
    if (!isDatabaseId(monitorId)) throw new Error("Choose a monitor for automatic status");
  }
  const automationToken = generateAutomationToken();
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    // Lock the monitor before creating the service so simultaneous submissions
    // cannot silently move an existing service's monitor to a second service.
    const monitor = statusSource === "AUTOMATIC"
      ? await transaction.selectFrom("monitors").select(["id", "componentId", "enabled", "isDown", "downStatus"])
        .where("id", "=", monitorId).where("pageId", "=", pageId).forUpdate().executeTakeFirst()
      : null;
    if (statusSource === "AUTOMATIC" && !monitor) throw new Error("Monitor not found on this page");
    if (monitor?.componentId) throw new Error("This monitor is already linked to a service. Choose another monitor.");
    const status = monitor?.enabled && monitor.isDown ? monitor.downStatus : "OPERATIONAL";
    const orderRow = await transaction.selectFrom("components")
      .select(sql<number>`coalesce(max("order"), -1) + 1`.as("nextOrder"))
      .where("pageId", "=", pageId).executeTakeFirstOrThrow();
    const component = await transaction.insertInto("components").values({
      pageId,
      groupId,
      name,
      description,
      status,
      order: Number(orderRow.nextOrder),
      visible: true,
      showUptime: true,
      manualStatus: "OPERATIONAL",
      isThirdParty: false,
      thirdPartyProvider: null,
      automationTokenHash: automationToken.hash,
      automationTokenPrefix: automationToken.prefix,
      automationTokenLastFour: automationToken.lastFour,
    }).returning("id").executeTakeFirstOrThrow();
    await transaction.insertInto("componentStatusEvents").values({
      componentId: component.id,
      status,
      startedAt: new Date(),
      endedAt: null,
      isMaintenance: false,
      note: null,
    }).execute();
    if (monitor) {
      await transaction.updateTable("monitors").set({ componentId: component.id, actionFlipStatus: true })
        .where("id", "=", monitor.id).where("pageId", "=", pageId).execute();
      await reconcileComponentStatus(component.id, transaction);
    }
  });
  if (statusSource === "AUTOMATIC") revalidatePath("/organization/monitors");
  await revalidatePageSurfaces(page);
}

export async function updateComponentStatus(pageId: string, componentId: string, formData: FormData) {
  const session = await requireCapability("component.update", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  const status = String(formData.get("status") ?? "OPERATIONAL");
  const note = String(formData.get("note") ?? "").trim();
  if (!COMPONENT_STATUSES.includes(status as ComponentStatus)) throw new Error("Invalid component status");
  if (note.length > 1_000) throw new Error("Status notes must be 1,000 characters or fewer");
  await assertComponentInPage(componentId, pageId);
  await assertManualServices(pageId, [componentId]);
  await setComponentStatus(componentId, status, { note: note || null });
  await revalidatePageSurfaces(page);
}

async function assertManualServices(pageId: string, componentIds: string[]) {
  const automatic = await database.selectFrom("monitors").select("id")
    .where("pageId", "=", pageId).where("componentId", "in", componentIds)
    .where("actionFlipStatus", "=", true).executeTakeFirst();
  if (automatic) throw new Error("Automatic services use their monitors. Select only manual services to change status.");
}

/** Applies one operator choice to an explicit, page-scoped set of services. */
export async function bulkComponentAction(pageId: string, componentIds: string[], operation: string, status?: string) {
  const capability = operation === "status" ? "component.update" : "page.configure";
  const session = await requireCapability(capability, pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  if (!Array.isArray(componentIds) || !componentIds.length || componentIds.length > 500 || new Set(componentIds).size !== componentIds.length) throw new Error("Select up to 500 distinct services");
  if (!["status", "publish", "unpublish"].includes(operation)) throw new Error("Invalid bulk action");
  if (operation === "status" && !COMPONENT_STATUSES.includes(status as ComponentStatus)) throw new Error("Invalid component status");
  const existing = await database.selectFrom("components").select("id").where("pageId", "=", pageId).where("id", "in", componentIds).execute();
  if (existing.length !== componentIds.length) throw new Error("Services changed; reload and select them again");
  if (operation === "status") {
    await assertManualServices(pageId, componentIds);
    for (const id of componentIds) await setComponentStatus(id, status as ComponentStatus, { note: null });
  } else {
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      await transaction.updateTable("components").set({ visible: operation === "publish" })
        .where("pageId", "=", pageId).where("id", "in", componentIds).execute();
    });
  }
  await revalidatePageSurfaces(page);
}

export async function updateComponentDetails(pageId: string, componentId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  await assertComponentInPage(componentId, pageId);
  const groupId = String(formData.get("groupId") ?? "") || null;
  if (groupId) await assertGroupInPage(groupId, pageId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Service name is required");
  if (name.length > 120) throw new Error("Service names must be 120 characters or fewer");
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 1_000) throw new Error("Descriptions must be 1,000 characters or fewer");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("components").set({
      name,
      description,
      visible: formData.get("visible") === "on",
      showUptime: formData.get("showUptime") === "on",
      groupId,
    }).where("id", "=", componentId).where("pageId", "=", pageId)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Component not found on this page");
  });
  await revalidatePageSurfaces(page);
}

/** Publish or unpublish one service: unpublished services disappear from the public page, feeds and subscriber choices. */
export async function setComponentVisibility(pageId: string, componentId: string, visible: boolean) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  await assertComponentInPage(componentId, pageId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await transaction.updateTable("components").set({ visible })
      .where("id", "=", componentId).where("pageId", "=", pageId).execute();
  });
  await revalidatePageSurfaces(page);
}

export async function reorderComponentOrder(pageId: string, orderedIds: string[]) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error("Duplicate component ordering entry");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const components = await transaction.selectFrom("components").select("id")
      .where("pageId", "=", pageId).forUpdate().execute();
    const currentIds = new Set(components.map((component) => component.id));
    if (currentIds.size !== orderedIds.length || orderedIds.some((id) => !currentIds.has(id))) {
      throw new Error("Components changed; reload before reordering");
    }
    if (orderedIds.length) {
      const clauses = orderedIds.map((id, order) => sql`when id = ${id}::uuid then ${order}`);
      await transaction.updateTable("components")
        .set({ order: sql<number>`case ${sql.join(clauses, sql` `)} else "order" end` })
        .where("pageId", "=", pageId).where("id", "in", orderedIds).execute();
    }
  });
  await revalidatePageSurfaces(page);
  return { ok: true } as const;
}

export async function deleteComponent(pageId: string, componentId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await assertStatusPage(pageId, session.orgId);
  await assertComponentInPage(componentId, pageId);
  await deleteComponentCascade(componentId, session.orgId, pageId);
  await revalidatePageSurfaces(page);
}
