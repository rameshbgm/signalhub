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
import { sanitizeCustomCss } from "@/lib/custom-css";
import { randomBytes } from "node:crypto";
import {
  validatedBrandColor,
  validatedExternalUrl,
  validatedLanguage,
  validatedLayout,
  validatedTimezone,
} from "@/lib/page-validation";
import { templateDesign } from "@/lib/page-design";
import { parseComponentDetailEdits } from "@/lib/component-detail-edits";
import { activePageFilter, deletedPageFilter } from "@/lib/page-lifecycle";

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
  const kind = String(formData.get("kind") ?? "STATUS");
  if (!["STATUS", "HUB"].includes(kind)) throw new Error("Invalid page kind");
  const isHub = kind === "HUB";
  const hubParentId = String(formData.get("hubParentId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password && password.length < 12) throw new Error("Page passwords must contain at least 12 characters");

  if (!name || !slug) throw new Error("Name is required");
  if (!["PUBLIC", "PRIVATE", "AUDIENCE"].includes(type)) throw new Error("Invalid page type");
  if (isHub && hubParentId) throw new Error("A hub cannot belong to another hub");
  if (type === "PRIVATE" && password.length < 12) {
    throw new Error("Private pages require a password of at least 12 characters");
  }
  if (hubParentId) {
    const parent = await collections.pages().findOne(activePageFilter({
      _id: oid(hubParentId),
      orgId: oid(session.orgId),
      isHub: true,
    }));
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
      publicVisible: false,
      setupCompletedAt: null,
      deletedAt: null,
      deletedBy: null,
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
  redirect(`/organization/pages/${_id.toHexString()}`);
}

export async function finishPageSetup(pageId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  let publicPath = "";
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }),
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    if (page.setupCompletedAt !== null) throw new Error("Page setup is already complete");

    if (page.isHub) {
      const childCount = await collections.pages().countDocuments(
        activePageFilter({
          orgId: page.orgId,
          hubParentId: page._id,
          isHub: false,
          publicVisible: { $ne: false },
        }),
        { session: databaseSession }
      );
      if (!childCount) throw new Error("Add and publish at least one child status page before publishing this hub");
    } else {
      const componentCount = await collections.components().countDocuments(
        { pageId: page._id, visible: true },
        { session: databaseSession }
      );
      if (!componentCount) throw new Error("Add at least one visible component before publishing this status page");
    }

    const now = new Date();
    const changed = await collections.pages().updateOne(
      { _id: page._id, orgId: page.orgId, setupCompletedAt: null },
      { $set: { setupCompletedAt: now, publicVisible: true } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Page setup changed; reload and try again");
    publicPath = page.isHub ? `/hub/${page.slug}` : `/${page.slug}`;
    await collections.auditLogs().insertOne({
      _id: new ObjectId(),
      orgId: page.orgId,
      actor: session.email,
      action: "COMPLETE_PAGE_SETUP",
      target: pageId,
      metadata: { changes: [
        { field: "setupCompletedAt", before: null, after: now.toISOString() },
        { field: "publicVisible", before: false, after: true },
      ] },
      supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
      createdAt: now,
    }, { session: databaseSession });
  });
  revalidatePath("/organization/pages");
  revalidatePath(`/organization/pages/${pageId}`);
  if (publicPath) revalidatePath(publicPath, "layout");
  redirect(`/organization/pages/${pageId}`);
}

export async function attachChildPage(hubId: string, formData: FormData) {
  const session = await requireCapability("page.configure", hubId);
  const childId = String(formData.get("childPageId") ?? "");
  if (!childId) throw new Error("Choose a child status page");
  let hubPublicPath = "";
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const hub = await collections.pages().findOne(
      activePageFilter({ _id: oid(hubId), orgId: oid(session.orgId), isHub: true }),
      { session: databaseSession }
    );
    if (!hub) throw new Error("Hub not found in your organization");
    hubPublicPath = `/hub/${hub.slug}`;
    const child = await collections.pages().findOne(
      activePageFilter({
        _id: oid(childId),
        orgId: hub.orgId,
        isHub: false,
        $or: [{ hubParentId: null }, { hubParentId: hub._id }],
      }),
      { session: databaseSession }
    );
    if (!child) throw new Error("Status page is unavailable or already belongs to another hub");
    const changed = await collections.pages().updateOne(
      { _id: child._id, orgId: hub.orgId },
      { $set: { hubParentId: hub._id } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Status page changed; reload and try again");
  });
  revalidatePath(`/organization/pages/${hubId}`);
  if (hubPublicPath) revalidatePath(hubPublicPath, "layout");
}

export async function detachChildPage(hubId: string, childId: string) {
  const session = await requireCapability("page.configure", hubId);
  let hubPublicPath = "";
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const hub = await collections.pages().findOne(
      activePageFilter({ _id: oid(hubId), orgId: oid(session.orgId), isHub: true }),
      { session: databaseSession }
    );
    if (!hub) throw new Error("Hub not found in your organization");
    hubPublicPath = `/hub/${hub.slug}`;
    const changed = await collections.pages().updateOne(
      activePageFilter({ _id: oid(childId), orgId: hub.orgId, isHub: false, hubParentId: hub._id }),
      { $set: { hubParentId: null } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Child status page not found on this hub");
  });
  revalidatePath(`/organization/pages/${hubId}`);
  if (hubPublicPath) revalidatePath(hubPublicPath, "layout");
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
  const headline = String(formData.get("headline") ?? "");
  const aboutText = String(formData.get("aboutText") ?? "");
  const supportUrl = validatedExternalUrl(String(formData.get("supportUrl") ?? ""), { allowMailto: true, label: "Support URL" });
  const termsUrl = validatedExternalUrl(String(formData.get("termsUrl") ?? ""), { label: "Terms URL" });
  const privacyUrl = validatedExternalUrl(String(formData.get("privacyUrl") ?? ""), { label: "Privacy URL" });
  const layout = validatedLayout(String(formData.get("layout") ?? "STANDARD"));
  const allowThemeOverride = formData.get("allowThemeOverride") === "on";
  const analyticsEnabled = formData.get("analyticsEnabled") === "on";
  const timezone = validatedTimezone(String(formData.get("timezone") ?? "UTC"));
  const language = validatedLanguage(String(formData.get("language") ?? "en"));

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
      activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }),
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found in your organization");
    publicPath = page.isHub ? `/hub/${page.slug}` : `/${page.slug}`;
    const nextSettings: Record<string, unknown> = {
      name, headline, aboutText, supportUrl, termsUrl, privacyUrl, brandColor,
      layout, themePreset, themeMode, allowThemeOverride, analyticsEnabled,
      timezone, language, removeBranding,
      ...(customCss !== undefined ? { customCss } : {}),
    };
    const changes = Object.entries(nextSettings)
      .filter(([field, value]) => page[field as keyof typeof page] !== value)
      .map(([field, after]) => ({ field, before: page[field as keyof typeof page] ?? null, after }));

    const currentComponents = await collections.components()
      .find({ pageId: page._id }, { session: databaseSession, projection: { _id: 1, name: 1, description: 1, groupId: 1, visible: 1, showUptime: 1 } })
      .toArray();
    const currentComponentIds = new Set(currentComponents.map((component) => component._id.toHexString()));
    if (componentEdits.some((component) => !currentComponentIds.has(component.id))) {
      throw new Error("Components changed while you were editing; reload and try again");
    }
    for (const edit of componentEdits) {
      const current = currentComponents.find((component) => component._id.toHexString() === edit.id);
      if (!current) continue;
      const componentFields = {
        name: edit.name,
        description: edit.description,
        groupId: edit.groupId,
        visible: edit.visible,
        showUptime: edit.showUptime,
      };
      for (const [field, after] of Object.entries(componentFields)) {
        const rawBefore = current[field as keyof typeof current];
        const before = rawBefore instanceof ObjectId ? rawBefore.toHexString() : rawBefore ?? null;
        if (before !== after) changes.push({ field: `component.${edit.id}.${field}`, before, after });
      }
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
          headline,
          aboutText,
          supportUrl,
          termsUrl,
          privacyUrl,
          brandColor,
          layout,
          themePreset,
          themeMode: themeMode as "SYSTEM" | "LIGHT" | "DARK",
          allowThemeOverride,
          analyticsEnabled,
          timezone,
          language,
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
      metadata: { componentCount: componentEdits.length, changes },
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
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const changed = await collections.pages().updateOne(
      activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }),
      { $set: { deletedAt: new Date(), deletedBy: oid(session.userId) } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Page is already deleted or unavailable");
    await collections.auditLogs().insertOne({
      _id: new ObjectId(),
      orgId: oid(session.orgId),
      actor: session.email,
      action: "SOFT_DELETE_PAGE",
      target: pageId,
      metadata: { changes: [{ field: "deletedAt", before: null, after: "soft-deleted" }] },
      supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
      createdAt: new Date(),
    }, { session: databaseSession });
  });
  revalidatePath("/organization/pages");
  revalidatePath("/organization/pages/deleted");
  redirect("/organization/pages");
}

export async function restorePage(pageId: string) {
  const session = await requireCapability("page.configure");
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const changed = await collections.pages().updateOne(
      deletedPageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }),
      { $set: { deletedAt: null, deletedBy: null } },
      { session: databaseSession }
    );
    if (!changed.matchedCount) throw new Error("Deleted page not found");
    await collections.auditLogs().insertOne({
      _id: new ObjectId(), orgId: oid(session.orgId), actor: session.email,
      action: "RESTORE_PAGE", target: pageId,
      metadata: { changes: [{ field: "deletedAt", before: "soft-deleted", after: null }] },
      supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
      createdAt: new Date(),
    }, { session: databaseSession });
  });
  revalidatePath("/organization/pages");
  revalidatePath("/organization/pages/deleted");
}

export async function setPagePublicVisibility(pageId: string, visible: boolean) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  let publicPath = "";
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const page = await collections.pages().findOne(
      activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }),
      { session: databaseSession }
    );
    if (!page) throw new Error("Page not found");
    if (visible && page.setupCompletedAt === null) {
      throw new Error("Finish page setup before publishing it");
    }
    publicPath = page.isHub ? `/hub/${page.slug}` : `/${page.slug}`;
    await collections.pages().updateOne(
      { _id: page._id, orgId: page.orgId },
      { $set: { publicVisible: visible } },
      { session: databaseSession }
    );
    await collections.auditLogs().insertOne({
      _id: new ObjectId(), orgId: page.orgId, actor: session.email,
      action: visible ? "SHOW_PAGE_PUBLICLY" : "HIDE_PAGE_PUBLICLY", target: pageId,
      metadata: { changes: [{ field: "publicVisible", before: page.publicVisible !== false, after: visible }] },
      supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
      createdAt: new Date(),
    }, { session: databaseSession });
  });
  revalidatePath("/organization/pages");
  revalidatePath(`/organization/pages/${pageId}`);
  if (publicPath) revalidatePath(publicPath, "layout");
}
