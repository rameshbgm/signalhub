"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { hashPassword } from "@/lib/auth";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { deletePageCascade } from "@/lib/cascade";

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
  const hubParentId = String(formData.get("hubParentId") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!name || !slug) throw new Error("Name is required");

  const existing = await collections.pages().findOne({ slug });
  if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const _id = new ObjectId();
  await collections.pages().insertOne({
    _id,
    orgId: oid(session.orgId),
    name,
    slug,
    type,
    isHub,
    hubParentId: hubParentId ? oid(hubParentId) : null,
    timezone: "UTC",
    language: "en",
    headline: "Service Status",
    aboutText: "",
    logoUrl: null,
    faviconUrl: null,
    brandColor: "#0052CC",
    supportUrl: null,
    customDomain: null,
    passwordHash: type === "PRIVATE" && password ? await hashPassword(password) : null,
    removeBranding: false,
    customCss: null,
    createdAt: new Date(),
  });

  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "CREATE_PAGE",
    target: slug,
    createdAt: new Date(),
  });

  revalidatePath("/admin/pages");
  redirect(`/admin/pages/${_id.toHexString()}`);
}

export async function updatePageSettings(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);

  const password = String(formData.get("password") ?? "");

  await collections.pages().updateOne(
    { _id: oid(pageId) },
    {
      $set: {
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
    }
  );

  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "UPDATE_PAGE_SETTINGS",
    target: pageId,
    createdAt: new Date(),
  });

  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deletePage(pageId: string) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);
  await deletePageCascade(pageId);
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: oid(session.orgId),
    actor: session.email,
    action: "DELETE_PAGE",
    target: pageId,
    createdAt: new Date(),
  });
  revalidatePath("/admin/pages");
  redirect("/admin/pages");
}
