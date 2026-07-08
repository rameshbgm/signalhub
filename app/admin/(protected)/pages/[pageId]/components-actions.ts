"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { deleteComponentCascade } from "@/lib/cascade";

export async function createGroup(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const count = await collections.componentGroups().countDocuments({ pageId: oid(pageId) });
  await collections.componentGroups().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    name: String(formData.get("name") ?? "New Group"),
    description: "",
    order: count,
    collapsed: false,
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteGroup(pageId: string, groupId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await collections.componentGroups().deleteOne({ _id: oid(groupId) });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function createComponent(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const count = await collections.components().countDocuments({ pageId: oid(pageId) });
  const isThirdParty = formData.get("isThirdParty") === "on";
  const thirdPartyProvider = String(formData.get("thirdPartyProvider") ?? "");
  const groupId = String(formData.get("groupId") ?? "");

  await collections.components().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    groupId: groupId ? oid(groupId) : null,
    name: isThirdParty && thirdPartyProvider ? thirdPartyProvider : String(formData.get("name") ?? "New Component"),
    description: String(formData.get("description") ?? ""),
    status: "OPERATIONAL",
    order: count,
    visible: true,
    showUptime: true,
    isThirdParty,
    thirdPartyProvider: isThirdParty ? thirdPartyProvider : null,
    automationToken: new ObjectId().toHexString(),
    createdAt: new Date(),
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function updateComponentStatus(pageId: string, componentId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const status = String(formData.get("status") ?? "OPERATIONAL");

  const componentDoc = await collections.components().findOne({ _id: oid(componentId) });
  if (!componentDoc) throw new Error("Component not found");

  if (componentDoc.status !== status) {
    await collections.componentStatusEvents().updateMany(
      { componentId: oid(componentId), endedAt: null },
      { $set: { endedAt: new Date() } }
    );
    await collections.componentStatusEvents().insertOne({
      _id: new ObjectId(),
      componentId: oid(componentId),
      status,
      startedAt: new Date(),
      endedAt: null,
      isMaintenance: status === "UNDER_MAINTENANCE",
    });
  }

  await collections.components().updateOne({ _id: oid(componentId) }, { $set: { status } });
  revalidatePath(`/admin/pages/${pageId}`);
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  revalidatePath(`/${pageDoc?.slug}`);
}

export async function updateComponentDetails(pageId: string, componentId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const groupId = String(formData.get("groupId") ?? "");
  await collections.components().updateOne(
    { _id: oid(componentId) },
    {
      $set: {
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        order: Number(formData.get("order") ?? 0),
        visible: formData.get("visible") === "on",
        showUptime: formData.get("showUptime") === "on",
        groupId: groupId ? oid(groupId) : null,
      },
    }
  );
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteComponent(pageId: string, componentId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await deleteComponentCascade(componentId);
  revalidatePath(`/admin/pages/${pageId}`);
}
