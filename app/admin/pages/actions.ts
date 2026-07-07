"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createPage(formData: FormData) {
  const session = await requireOrgSession();
  const name = String(formData.get("name") ?? "").trim();
  let slug = slugify(String(formData.get("slug") ?? "") || name);
  const type = String(formData.get("type") ?? "PUBLIC");
  const isHub = formData.get("isHub") === "on";
  const hubParentId = String(formData.get("hubParentId") ?? "") || null;
  const password = String(formData.get("password") ?? "");

  if (!name || !slug) throw new Error("Name is required");

  const existing = await prisma.page.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const page = await prisma.page.create({
    data: {
      orgId: session.orgId,
      name,
      slug,
      type,
      isHub,
      hubParentId: hubParentId || undefined,
      passwordHash: type === "PRIVATE" && password ? await hashPassword(password) : undefined,
    },
  });

  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "CREATE_PAGE", target: page.slug } });

  revalidatePath("/admin/pages");
  redirect(`/admin/pages/${page.id}`);
}

export async function updatePageSettings(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);

  const password = String(formData.get("password") ?? "");

  await prisma.page.update({
    where: { id: pageId },
    data: {
      name: String(formData.get("name") ?? ""),
      headline: String(formData.get("headline") ?? ""),
      aboutText: String(formData.get("aboutText") ?? ""),
      supportUrl: String(formData.get("supportUrl") ?? "") || null,
      brandColor: String(formData.get("brandColor") ?? "#0052CC"),
      logoUrl: String(formData.get("logoUrl") ?? "") || null,
      faviconUrl: String(formData.get("faviconUrl") ?? "") || null,
      customDomain: String(formData.get("customDomain") ?? "") || null,
      timezone: String(formData.get("timezone") ?? "UTC"),
      language: String(formData.get("language") ?? "en"),
      removeBranding: formData.get("removeBranding") === "on",
      customCss: String(formData.get("customCss") ?? "") || null,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });

  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "UPDATE_PAGE_SETTINGS", target: pageId } });

  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deletePage(pageId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await prisma.page.delete({ where: { id: pageId } });
  await prisma.auditLog.create({ data: { orgId: session.orgId, actor: session.email, action: "DELETE_PAGE", target: pageId } });
  revalidatePath("/admin/pages");
  redirect("/admin/pages");
}
