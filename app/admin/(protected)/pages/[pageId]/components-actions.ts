"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function createGroup(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const count = await prisma.componentGroup.count({ where: { pageId } });
  await prisma.componentGroup.create({
    data: { pageId, name: String(formData.get("name") ?? "New Group"), order: count },
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteGroup(pageId: string, groupId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await prisma.componentGroup.delete({ where: { id: groupId } });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function createComponent(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const count = await prisma.component.count({ where: { pageId } });
  const isThirdParty = formData.get("isThirdParty") === "on";
  const thirdPartyProvider = String(formData.get("thirdPartyProvider") ?? "");

  await prisma.component.create({
    data: {
      pageId,
      groupId: String(formData.get("groupId") ?? "") || null,
      name: isThirdParty && thirdPartyProvider ? thirdPartyProvider : String(formData.get("name") ?? "New Component"),
      description: String(formData.get("description") ?? ""),
      order: count,
      isThirdParty,
      thirdPartyProvider: isThirdParty ? thirdPartyProvider : null,
    },
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function updateComponentStatus(pageId: string, componentId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const status = String(formData.get("status") ?? "OPERATIONAL");

  const component = await prisma.component.findUnique({ where: { id: componentId } });
  if (!component) throw new Error("Component not found");

  if (component.status !== status) {
    await prisma.componentStatusEvent.updateMany({
      where: { componentId, endedAt: null },
      data: { endedAt: new Date() },
    });
    await prisma.componentStatusEvent.create({
      data: { componentId, status, isMaintenance: status === "UNDER_MAINTENANCE" },
    });
  }

  await prisma.component.update({ where: { id: componentId }, data: { status } });
  revalidatePath(`/admin/pages/${pageId}`);
  revalidatePath(`/${(await prisma.page.findUnique({ where: { id: pageId } }))?.slug}`);
}

export async function updateComponentDetails(pageId: string, componentId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await prisma.component.update({
    where: { id: componentId },
    data: {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      order: Number(formData.get("order") ?? 0),
      visible: formData.get("visible") === "on",
      showUptime: formData.get("showUptime") === "on",
      groupId: String(formData.get("groupId") ?? "") || null,
    },
  });
  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deleteComponent(pageId: string, componentId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await prisma.component.delete({ where: { id: componentId } });
  revalidatePath(`/admin/pages/${pageId}`);
}
