"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import {
  requireCapability,
  assertPageInOrg,
  assertComponentInPage,
  assertGroupInPage,
} from "@/lib/admin-guard";
import { deleteComponentCascade } from "@/lib/cascade";
import { setComponentStatus } from "@/lib/component-status";
import { generateAutomationToken } from "@/lib/tokens";
import { withTransaction } from "@/lib/cascade";
import { COMPONENT_STATUSES, type ComponentStatus } from "@/lib/status";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

async function assertStatusPage(pageId: string, orgId: string) {
  const page = await collections.pages().findOne({ _id: oid(pageId), orgId: oid(orgId) });
  if (!page) throw new Error("Page not found in your organization");
  if (page.isHub) throw new Error("Components belong to child status pages, not hubs");
  return page;
}

export async function createGroup(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Group name is required");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const count = await collections.componentGroups().countDocuments(
      { pageId: oid(pageId) },
      { session: databaseSession }
    );
    await collections.componentGroups().insertOne({
      _id: new ObjectId(),
      pageId: oid(pageId),
      name,
      description: "",
      order: count,
      collapsed: false,
    }, { session: databaseSession });
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function deleteGroup(pageId: string, groupId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  await assertGroupInPage(groupId, pageId);
  await withTransaction(async (dbSession) => {
    await fenceActiveOrganizationMutation(session.orgId, dbSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: dbSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const group = await collections.componentGroups().findOne(
      { _id: oid(groupId), pageId: page._id },
      { session: dbSession }
    );
    if (!group) throw new Error("Component group not found");
    await collections
      .components()
      .updateMany({ pageId: page._id, groupId: group._id }, { $set: { groupId: null } }, { session: dbSession });
    const removed = await collections
      .componentGroups()
      .deleteOne({ _id: group._id, pageId: page._id }, { session: dbSession });
    if (!removed.deletedCount) throw new Error("Component group changed; reload and retry");
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function createComponent(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  const groupId = String(formData.get("groupId") ?? "");
  if (groupId) await assertGroupInPage(groupId, pageId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Component name is required");
  const automationToken = generateAutomationToken();
  const componentId = new ObjectId();
  const now = new Date();
  await withTransaction(async (dbSession) => {
    await fenceActiveOrganizationMutation(session.orgId, dbSession);
    const currentPage = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: dbSession }
    );
    if (!currentPage) throw new Error("Page not found in your organization");
    if (groupId) {
      const currentGroup = await collections.componentGroups().findOne(
        { _id: oid(groupId), pageId: currentPage._id },
        { session: dbSession }
      );
      if (!currentGroup) throw new Error("Component group not found on this page");
    }
    const count = await collections.components().countDocuments(
      { pageId: currentPage._id },
      { session: dbSession }
    );
    await collections.components().insertOne({
      _id: componentId,
      pageId: oid(pageId),
      groupId: groupId ? oid(groupId) : null,
      name,
      description: String(formData.get("description") ?? ""),
      status: "OPERATIONAL",
      order: count,
      visible: true,
      showUptime: true,
      manualStatus: "OPERATIONAL",
      isThirdParty: false,
      thirdPartyProvider: null,
      automationTokenHash: automationToken.hash,
      automationTokenPrefix: automationToken.prefix,
      automationTokenLastFour: automationToken.lastFour,
      createdAt: now,
    }, { session: dbSession });
    await collections.componentStatusEvents().insertOne({
      _id: new ObjectId(),
      componentId,
      status: "OPERATIONAL",
      startedAt: now,
      endedAt: null,
      isMaintenance: false,
    }, { session: dbSession });
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function updateComponentStatus(pageId: string, componentId: string, formData: FormData) {
  const session = await requireCapability("component.update", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  const status = String(formData.get("status") ?? "OPERATIONAL");
  const note = String(formData.get("note") ?? "").trim();
  if (!COMPONENT_STATUSES.includes(status as ComponentStatus)) throw new Error("Invalid component status");
  if (note.length > 1_000) throw new Error("Status notes must be 1,000 characters or fewer");
  await assertComponentInPage(componentId, pageId);

  await setComponentStatus(oid(componentId), status, { note: note || null });
  revalidatePath(`/organization/pages/${pageId}`);
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  revalidatePath(`/${pageDoc?.slug}`);
}

export async function updateComponentDetails(pageId: string, componentId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  await assertComponentInPage(componentId, pageId);
  const groupId = String(formData.get("groupId") ?? "");
  if (groupId) await assertGroupInPage(groupId, pageId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Component name is required");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    if (groupId) {
      const group = await collections.componentGroups().findOne(
        { _id: oid(groupId), pageId: page._id },
        { session: databaseSession }
      );
      if (!group) throw new Error("Component group not found on this page");
    }
    const changed = await collections.components().updateOne(
      { _id: oid(componentId), pageId: page._id },
      {
        $set: {
          name,
          description: String(formData.get("description") ?? ""),
          visible: formData.get("visible") === "on",
          showUptime: formData.get("showUptime") === "on",
          groupId: groupId ? oid(groupId) : null,
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Component not found on this page");
  });
  revalidatePath(`/organization/pages/${pageId}`);
}

export async function reorderComponentOrder(pageId: string, orderedIds: string[]) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await assertStatusPage(pageId, session.orgId);
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error("Duplicate component ordering entry");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    const components = await collections.components().find(
      { pageId: page._id },
      { session: databaseSession }
    ).toArray();
    const currentIds = new Set(components.map((component) => component._id.toHexString()));
    if (currentIds.size !== orderedIds.length || orderedIds.some((id) => !currentIds.has(id))) {
      throw new Error("Components changed; reload before reordering");
    }
    for (const [order, id] of orderedIds.entries()) {
      await collections.components().updateOne(
        { _id: oid(id), pageId: page._id },
        { $set: { order } },
        { session: databaseSession }
      );
    }
  });
  const page = await collections.pages().findOne({ _id: oid(pageId), orgId: oid(session.orgId) });
  revalidatePath(`/organization/pages/${pageId}`);
  if (page) revalidatePath(`/${page.slug}`, "layout");
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
