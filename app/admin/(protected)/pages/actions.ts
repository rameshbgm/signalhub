"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { hashPassword } from "@/lib/auth";
import { requireOrgSession, assertPageInOrg } from "@/lib/admin-guard";
import { deletePageCascade } from "@/lib/cascade";
import { assertWithinLimit, getOrgPlan } from "@/lib/billing";

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
  await assertWithinLimit(session.orgId, "pages");

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
    coverImageUrl: null,
    brandColor: "#0052CC",
    layout: "STANDARD",
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
  redirect(`/admin/pages/${_id.toHexString()}/setup/components`);
}

export async function updatePageSettings(pageId: string, formData: FormData) {
  const session = await requireOrgSession();
  await assertPageInOrg(pageId, session.orgId);

  const password = String(formData.get("password") ?? "");
  const plan = await getOrgPlan(session.orgId);

  const customDomain = String(formData.get("customDomain") ?? "").trim().toLowerCase() || null;
  if (customDomain && !plan.customDomain) {
    throw new Error(`Custom domains require the Pro plan or higher. Upgrade in Billing.`);
  }
  if (customDomain) {
    const taken = await collections.pages().findOne({ customDomain, _id: { $ne: oid(pageId) } });
    if (taken) throw new Error("This domain is already connected to another status page");
  }

  const removeBranding = formData.get("removeBranding") === "on" && plan.removeBranding;

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
        coverImageUrl: String(formData.get("coverImageUrl") ?? "") || null,
        layout: String(formData.get("layout") ?? "STANDARD") === "COVER" ? "COVER" : "STANDARD",
        customDomain,
        timezone: String(formData.get("timezone") ?? "UTC"),
        language: String(formData.get("language") ?? "en"),
        removeBranding,
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
