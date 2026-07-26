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
import { templateDesign } from "@/lib/page-design";
import { parseComponentDetailEdits } from "@/lib/component-detail-edits";

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
  const initialDesign = templateDesign("CENTERED_SUMMARY", "#0052CC");
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
      coverImageFit: "CONTAIN",
      coverImagePositionX: 50,
      coverImagePositionY: 50,
      coverImageCropX: null,
      coverImageCropY: null,
      coverImageCropWidth: null,
      coverImageCropHeight: null,
      brandColor: "#0052CC",
      layout: "STANDARD",
      supportUrl: null,
      termsUrl: null,
      privacyUrl: null,
      passwordHash,
      removeBranding: false,
      customCss: null,
      themePreset: "SIGNAL",
      themeMode: "SYSTEM",
      allowThemeOverride: true,
      analyticsEnabled: type === "PUBLIC",
      publishedDesign: initialDesign,
      publishedDesignVersion: 1,
      designPublishedAt: new Date(),
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

  revalidatePath("/organization/pages");
  redirect(`/organization/pages/${_id.toHexString()}/setup/components`);
}

export async function updatePageSettings(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);

  const password = String(formData.get("password") ?? "");
  const removeBranding = formData.get("removeBranding") === "on";
  const customCss = formData.has("customCss")
    ? sanitizeCustomCss(String(formData.get("customCss") ?? ""))
    : undefined;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Page name is required");
  const brandColor = validatedBrandColor(String(formData.get("brandColor") ?? "#0052CC"));

  const themePreset = String(formData.get("themePreset") ?? "SIGNAL");
  const themeMode = String(formData.get("themeMode") ?? "SYSTEM");
  if (!["SIGNAL", "CALM", "CONTRAST"].includes(themePreset)) throw new Error("Invalid theme preset");
  if (!["SYSTEM", "LIGHT", "DARK"].includes(themeMode)) throw new Error("Invalid theme mode");
  const componentEdits = parseComponentDetailEdits(formData);

  const passwordHash = password ? await hashPassword(password) : null;
  let publicPath = "";
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      { _id: oid(pageId), orgId: oid(session.orgId) },
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    publicPath = page.isHub ? `/hub/${page.slug}` : `/${page.slug}`;

    const currentComponents = await collections.components()
      .find({ pageId: page._id }, { session: databaseSession, projection: { _id: 1 } })
      .toArray();
    const currentComponentIds = new Set(currentComponents.map((component) => component._id.toHexString()));
    if (componentEdits.some((component) => !currentComponentIds.has(component.id))) {
      throw new Error("Components changed while you were editing; reload and try again");
    }
    const selectedGroupIds = [...new Set(componentEdits.flatMap((component) => component.groupId ? [component.groupId] : []))];
    if (selectedGroupIds.length) {
      const matchingGroups = await collections.componentGroups().countDocuments(
        { _id: { $in: selectedGroupIds.map(oid) }, pageId: page._id },
        { session: databaseSession }
      );
      if (matchingGroups !== selectedGroupIds.length) {
        throw new Error("A selected component group is no longer available");
      }
    }
    if (componentEdits.length) {
      const componentResult = await collections.components().bulkWrite(
        componentEdits.map((component) => ({
          updateOne: {
            filter: { _id: oid(component.id), pageId: page._id },
            update: {
              $set: {
                name: component.name,
                description: component.description,
                groupId: component.groupId ? oid(component.groupId) : null,
                visible: component.visible,
                showUptime: component.showUptime,
              },
            },
          },
        })),
        { session: databaseSession }
      );
      if (componentResult.matchedCount !== componentEdits.length) {
        throw new Error("A component changed while settings were being saved");
      }
    }
    const changed = await collections.pages().updateOne(
      { _id: page._id, orgId: page.orgId },
      {
        $set: {
          name,
          headline: String(formData.get("headline") ?? ""),
          aboutText: String(formData.get("aboutText") ?? ""),
          supportUrl: validatedExternalUrl(String(formData.get("supportUrl") ?? ""), { allowMailto: true, label: "Support URL" }),
          termsUrl: validatedExternalUrl(String(formData.get("termsUrl") ?? ""), { label: "Terms URL" }),
          privacyUrl: validatedExternalUrl(String(formData.get("privacyUrl") ?? ""), { label: "Privacy URL" }),
          brandColor,
          layout: validatedLayout(String(formData.get("layout") ?? "STANDARD")),
          themePreset,
          themeMode: themeMode as "SYSTEM" | "LIGHT" | "DARK",
          allowThemeOverride: formData.get("allowThemeOverride") === "on",
          analyticsEnabled: formData.get("analyticsEnabled") === "on",
          timezone: validatedTimezone(String(formData.get("timezone") ?? "UTC")),
          language: validatedLanguage(String(formData.get("language") ?? "en")),
          removeBranding,
          ...(customCss !== undefined ? { customCss } : {}),
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
      metadata: { componentCount: componentEdits.length },
      supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
      createdAt: new Date(),
    }, { session: databaseSession });
  });

  revalidatePath(`/organization/pages/${pageId}`);
  if (publicPath) revalidatePath(publicPath, "layout");
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
  revalidatePath("/organization/pages");
  redirect("/organization/pages");
}
