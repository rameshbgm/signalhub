"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { hashPassword } from "@/lib/auth";
import { requireCapability, assertPageInOrg } from "@/lib/admin-guard";
import { deletePageCascade } from "@/lib/cascade";
import { sanitizeCustomCss } from "@/lib/custom-css";
import { randomBytes } from "node:crypto";
import {
  validatedBrandColor,
  validatedExternalUrl,
  validatedLanguage,
  validatedLayout,
  validatedTimezone,
} from "@/lib/page-validation";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createPage(formData: FormData) {
  const session = await requireCapability("page.configure");
  const name = String(formData.get("name") ?? "").trim();
  let slug = slugify(String(formData.get("slug") ?? "") || name);
  const type = String(formData.get("type") ?? "PUBLIC");
  const isHub = formData.get("isHub") === "on";
  const hubParentId = String(formData.get("hubParentId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password && password.length < 12) throw new Error("Page passwords must contain at least 12 characters");

  if (!name || !slug) throw new Error("Name is required");
  if (!["PUBLIC", "PRIVATE", "AUDIENCE"].includes(type)) throw new Error("Invalid page type");
  if (type === "PRIVATE" && password.length < 12) {
    throw new Error("Private pages require a password of at least 12 characters");
  }
  if (hubParentId) {
    const parent = await collections.pages().findOne({
      _id: oid(hubParentId),
      orgId: oid(session.orgId),
      isHub: true,
    });
    if (!parent) throw new Error("Hub parent not found in your organization");
  }

  const existing = await collections.pages().findOne({ slug });
  if (existing) slug = `${slug}-${randomBytes(3).toString("hex")}`;

  const _id = new ObjectId();
  const passwordHash =
    type === "PRIVATE" && password ? await hashPassword(password) : null;
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
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
      termsUrl: null,
      privacyUrl: null,
      customDomain: null,
      passwordHash,
      removeBranding: false,
      customCss: null,
      themePreset: "SIGNAL",
      themeMode: "SYSTEM",
      allowThemeOverride: true,
      analyticsEnabled: type === "PUBLIC",
      createdAt: new Date(),
    }, { session: databaseSession });

    await collections.auditLogs().insertOne({
      _id: new ObjectId(),
      orgId: oid(session.orgId),
      actor: session.email,
      action: "CREATE_PAGE",
      target: slug,
      supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
      createdAt: new Date(),
    }, { session: databaseSession });
  });

  revalidatePath("/admin/pages");
  redirect(`/admin/pages/${_id.toHexString()}/setup/components`);
}

export async function updatePageSettings(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);

  const password = String(formData.get("password") ?? "");
  const customDomain = String(formData.get("customDomain") ?? "").trim().toLowerCase() || null;
  if (customDomain) {
    if (
      customDomain.includes("/") ||
      customDomain.includes(":") ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(customDomain)
    ) {
      throw new Error("Enter a valid hostname without a scheme, port, or path");
    }
    const taken = await collections.pages().findOne({ customDomain, _id: { $ne: oid(pageId) } });
    if (taken) throw new Error("This domain is already connected to another status page");
  }

  const removeBranding = formData.get("removeBranding") === "on";
  const customCss = sanitizeCustomCss(String(formData.get("customCss") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Page name is required");
  const brandColor = validatedBrandColor(String(formData.get("brandColor") ?? "#0052CC"));

  const rawLogoUrl = String(formData.get("logoUrl") ?? "").trim();
  const rawFaviconUrl = String(formData.get("faviconUrl") ?? "").trim();
  const rawCoverImageUrl = String(formData.get("coverImageUrl") ?? "").trim();
  const themePreset = String(formData.get("themePreset") ?? "SIGNAL");
  const themeMode = String(formData.get("themeMode") ?? "SYSTEM");
  if (!["SIGNAL", "CALM", "CONTRAST"].includes(themePreset)) throw new Error("Invalid theme preset");
  if (!["SYSTEM", "LIGHT", "DARK"].includes(themeMode)) throw new Error("Invalid theme mode");

  const passwordHash = password ? await hashPassword(password) : null;
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const changed = await collections.pages().updateOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      {
        $set: {
          name,
          headline: String(formData.get("headline") ?? ""),
          aboutText: String(formData.get("aboutText") ?? ""),
          supportUrl: validatedExternalUrl(String(formData.get("supportUrl") ?? ""), { allowMailto: true, label: "Support URL" }),
          termsUrl: validatedExternalUrl(String(formData.get("termsUrl") ?? ""), { label: "Terms URL" }),
          privacyUrl: validatedExternalUrl(String(formData.get("privacyUrl") ?? ""), { label: "Privacy URL" }),
          brandColor,
          logoUrl: rawLogoUrl ? validatedExternalUrl(rawLogoUrl, { label: "Logo URL" }) : null,
          faviconUrl: rawFaviconUrl
            ? validatedExternalUrl(rawFaviconUrl, { label: "Favicon URL" })
            : null,
          coverImageUrl: rawCoverImageUrl
            ? validatedExternalUrl(rawCoverImageUrl, { label: "Cover image URL" })
            : null,
          layout: validatedLayout(String(formData.get("layout") ?? "STANDARD")),
          themePreset,
          themeMode: themeMode as "SYSTEM" | "LIGHT" | "DARK",
          allowThemeOverride: formData.get("allowThemeOverride") === "on",
          analyticsEnabled: formData.get("analyticsEnabled") === "on",
          customDomain,
          timezone: validatedTimezone(String(formData.get("timezone") ?? "UTC")),
          language: validatedLanguage(String(formData.get("language") ?? "en")),
          removeBranding,
          customCss,
          ...(passwordHash ? { passwordHash } : {}),
        },
      },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Page not found in your organization");
    await collections.auditLogs().insertOne({
      _id: new ObjectId(),
      orgId: oid(session.orgId),
      actor: session.email,
      action: "UPDATE_PAGE_SETTINGS",
      target: pageId,
      supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
      createdAt: new Date(),
    }, { session: databaseSession });
  });

  revalidatePath(`/admin/pages/${pageId}`);
}

export async function deletePage(pageId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await deletePageCascade(pageId, session.orgId);
  await writeActiveTenantAudit(session.orgId, {
    actor: session.email,
    action: "DELETE_PAGE",
    target: pageId,
    supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
    createdAt: new Date(),
  });
  revalidatePath("/admin/pages");
  redirect("/admin/pages");
}
