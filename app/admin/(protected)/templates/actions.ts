"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function createTemplateGroup(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await collections.templateGroups().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    name: String(formData.get("name") ?? "New Group"),
  });
  revalidatePath("/admin/templates");
}

export async function createTemplate(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const componentIds = formData.getAll("componentIds").map(String);
  const groupId = String(formData.get("groupId") ?? "");
  await collections.incidentTemplates().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    groupId: groupId ? oid(groupId) : null,
    title: String(formData.get("title") ?? "Untitled template"),
    body: String(formData.get("body") ?? ""),
    defaultStatus: String(formData.get("defaultStatus") ?? "INVESTIGATING"),
    defaultImpact: String(formData.get("defaultImpact") ?? "MINOR"),
    defaultComponentIds: JSON.stringify(componentIds),
    createdAt: new Date(),
  });
  revalidatePath("/admin/templates");
}

export async function deleteTemplate(templateId: string) {
  const session = await requireOrgSession();
  const templateDoc = await collections.incidentTemplates().findOne({ _id: oid(templateId) });
  if (!templateDoc) return;
  const template = toId(templateDoc);
  await assertPageInOrg(template.pageId, session.orgId);
  await collections.incidentTemplates().deleteOne({ _id: oid(templateId) });
  revalidatePath("/admin/templates");
}
