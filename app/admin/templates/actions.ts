"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

export async function createTemplateGroup(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await prisma.templateGroup.create({ data: { pageId, name: String(formData.get("name") ?? "New Group") } });
  revalidatePath("/admin/templates");
}

export async function createTemplate(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  const componentIds = formData.getAll("componentIds").map(String);
  await prisma.incidentTemplate.create({
    data: {
      pageId,
      groupId: String(formData.get("groupId") ?? "") || null,
      title: String(formData.get("title") ?? "Untitled template"),
      body: String(formData.get("body") ?? ""),
      defaultStatus: String(formData.get("defaultStatus") ?? "INVESTIGATING"),
      defaultImpact: String(formData.get("defaultImpact") ?? "MINOR"),
      defaultComponentIds: JSON.stringify(componentIds),
    },
  });
  revalidatePath("/admin/templates");
}

export async function deleteTemplate(templateId: string) {
  const session = await requireOrgSession();
  const template = await prisma.incidentTemplate.findUnique({ where: { id: templateId } });
  if (!template) return;
  await assertPageInOrg(template.pageId, session.orgId);
  await prisma.incidentTemplate.delete({ where: { id: templateId } });
  revalidatePath("/admin/templates");
}
