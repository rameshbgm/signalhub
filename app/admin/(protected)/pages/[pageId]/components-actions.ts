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
import { setComponentStatus } from "@/lib/component-status";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
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

export async function createGroup(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Group name is required");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const orderRow = await transaction.selectFrom("componentGroups")
      .select(sql<number>`coalesce(max("order"), -1) + 1`.as("nextOrder"))
      .where("pageId", "=", pageId).executeTakeFirstOrThrow();
    await transaction.insertInto("componentGroups").values({
      pageId,
      name,
      description: "",
      order: Number(orderRow.nextOrder),
      collapsed: false,
    }).execute();
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function deleteGroup(pageId: string, groupId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  await assertGroupInPage(groupId, pageId);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const removed = await transaction.deleteFrom("componentGroups")
      .where("id", "=", groupId).where("pageId", "=", pageId)
      .returning("id").executeTakeFirst();
    if (!removed) throw new Error("Component group changed; reload and retry");
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function createComponent(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  const groupId = String(formData.get("groupId") ?? "") || null;
  if (groupId) await assertGroupInPage(groupId, pageId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Component name is required");
  const automationToken = generateAutomationToken();
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const orderRow = await transaction.selectFrom("components")
      .select(sql<number>`coalesce(max("order"), -1) + 1`.as("nextOrder"))
      .where("pageId", "=", pageId).executeTakeFirstOrThrow();
    const component = await transaction.insertInto("components").values({
      pageId,
      groupId,
      name,
      description: String(formData.get("description") ?? ""),
      status: "OPERATIONAL",
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
      status: "OPERATIONAL",
      startedAt: new Date(),
      endedAt: null,
      isMaintenance: false,
      note: null,
    }).execute();
  });
  revalidatePath(`/organization/pages/${pageId}`);
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
  await setComponentStatus(componentId, status, { note: note || null });
  revalidatePath(`/organization/pages/${pageId}`);
  revalidatePath(`/${page.slug}`);
}

export async function updateComponentDetails(pageId: string, componentId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  await assertComponentInPage(componentId, pageId);
  const groupId = String(formData.get("groupId") ?? "") || null;
  if (groupId) await assertGroupInPage(groupId, pageId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Component name is required");
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("components").set({
      name,
      description: String(formData.get("description") ?? ""),
      visible: formData.get("visible") === "on",
      showUptime: formData.get("showUptime") === "on",
      groupId,
    }).where("id", "=", componentId).where("pageId", "=", pageId)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Component not found on this page");
  });
  revalidatePath(`/organization/pages/${pageId}`);
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
  revalidatePath(`/organization/pages/${pageId}`);
  revalidatePath(`/${page.slug}`, "layout");
  return { ok: true } as const;
}

export async function deleteComponent(pageId: string, componentId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  await assertComponentInPage(componentId, pageId);
  await deleteComponentCascade(componentId, session.orgId, pageId);
  revalidatePath(`/organization/pages/${pageId}`);
}
