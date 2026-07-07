"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function createAccessGroup(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const componentIds = formData.getAll("componentIds").map(String);
  await prisma.pageAccessGroup.create({
    data: { pageId, name: String(formData.get("name") ?? "New Group"), componentIds: JSON.stringify(componentIds) },
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteAccessGroup(pageId: string, groupId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await prisma.pageAccessGroup.delete({ where: { id: groupId } });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function createAccessUser(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "changeme123");
  const groupId = String(formData.get("groupId") ?? "") || null;
  const componentIds = formData.getAll("componentIds").map(String);

  await prisma.pageAccessUser.create({
    data: { pageId, email, passwordHash: await hashPassword(password), groupId, componentIds: JSON.stringify(componentIds) },
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteAccessUser(pageId: string, userId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await prisma.pageAccessUser.delete({ where: { id: userId } });
  revalidatePath(`/admin/pages/${pageId}`);
}
