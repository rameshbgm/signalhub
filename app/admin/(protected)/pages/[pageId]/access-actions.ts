"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { hashPassword } from "@/lib/auth";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function createAccessGroup(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const componentIds = formData.getAll("componentIds").map(String);
  await collections.pageAccessGroups().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    name: String(formData.get("name") ?? "New Group"),
    componentIds: JSON.stringify(componentIds),
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteAccessGroup(pageId: string, groupId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await collections.pageAccessGroups().deleteOne({ _id: oid(groupId) });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function createAccessUser(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "changeme123");
  const groupId = String(formData.get("groupId") ?? "");
  const componentIds = formData.getAll("componentIds").map(String);

  await collections.pageAccessUsers().insertOne({
    _id: new ObjectId(),
    pageId: oid(pageId),
    email,
    passwordHash: await hashPassword(password),
    groupId: groupId ? oid(groupId) : null,
    componentIds: JSON.stringify(componentIds),
    createdAt: new Date(),
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteAccessUser(pageId: string, userId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await collections.pageAccessUsers().deleteOne({ _id: oid(userId) });
  revalidatePath(`/admin/pages/${pageId}`);
}
