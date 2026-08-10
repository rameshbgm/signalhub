"use server";

import { randomBytes } from "node:crypto";
import { sql, type Selectable, type Updateable } from "kysely";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability, assertPageInOrg } from "@/lib/admin-guard";
import { hashPassword } from "@/lib/auth";
import { withTransaction } from "@/lib/cascade";
import { parseComponentDetailEdits } from "@/lib/component-detail-edits";
import { sanitizeCustomCss } from "@/lib/custom-css";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import {
  PAGE_DESIGN_VERSION_HISTORY_LIMIT,
  PAGE_THEME_PRESET_KEYS,
  designWithThemePreset,
  pageDesignFor,
  sameStatusPageDesign,
  statusPageDesignSchema,
  templateDesign,
  type PageThemePresetKey,
  type StatusPageDesign,
} from "@/lib/page-design";
import {
  validatedBrandColor,
  validatedExternalUrl,
  validatedLanguage,
  validatedLayout,
  validatedTimezone,
} from "@/lib/page-validation";
import type { DatabaseTransaction } from "@/lib/postgres/client";
import type { PageTable } from "@/lib/postgres/schema";

type AdminSession = Awaited<ReturnType<typeof requireCapability>>;

function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function audit(
  transaction: DatabaseTransaction,
  session: AdminSession,
  action: string,
  target: string,
  metadata: unknown = null,
  createdAt = new Date()
) {
  await transaction.insertInto("auditLogs").values({
    orgId: session.orgId,
    actor: session.email,
    action,
    target,
    metadata,
    supportSessionId: session.supportSessionId ?? null,
    createdAt,
  }).execute();
}

async function retainDesignVersion(
  transaction: DatabaseTransaction,
  pageId: string,
  version: number,
  design: StatusPageDesign,
  userId: string,
  now: Date
) {
  await transaction.insertInto("pageDesignVersions").values({
    pageId,
    version,
    design,
    publishedBy: userId,
    publishedAt: now,
  }).execute();
  await sql`
    delete from page_design_versions
    where page_id = ${pageId}::uuid
      and id not in (
        select id from page_design_versions
        where page_id = ${pageId}::uuid
        order by published_at desc, id desc
        limit ${PAGE_DESIGN_VERSION_HISTORY_LIMIT}
      )
  `.execute(transaction);
}

async function synchronizeDraft(
  transaction: DatabaseTransaction,
  pageId: string,
  design: StatusPageDesign,
  version: number,
  userId: string,
  now: Date
) {
  await transaction.updateTable("pageDesignDrafts")
    .set((eb) => ({
      design,
      revision: eb("revision", "+", 1),
      basePublishedVersion: version,
      updatedBy: userId,
      updatedAt: now,
    }))
    .where("pageId", "=", pageId)
    .execute();
}

export async function createPage(formData: FormData) {
  const session = await requireCapability("page.configure");
  const name = String(formData.get("name") ?? "").trim();
  let slug = slugify(String(formData.get("slug") ?? "") || name);
  const type = String(formData.get("type") ?? "PUBLIC") as PageTable["type"];
  const kind = String(formData.get("kind") ?? "STATUS");
  const isHub = kind === "HUB";
  const hubParentId = String(formData.get("hubParentId") ?? "") || null;
  const password = String(formData.get("password") ?? "");
  if (!["STATUS", "HUB"].includes(kind)) throw new Error("Invalid page kind");
  if (!name || name.length > 120) throw new Error("Page name is required and must be 120 characters or fewer");
  if (!slug || slug.length > 80) throw new Error("URL slug is required and must be 80 characters or fewer");
  if (!["PUBLIC", "PRIVATE", "AUDIENCE"].includes(type)) throw new Error("Invalid page type");
  if (password && password.length < 12) throw new Error("Page passwords must contain at least 12 characters");
  if (type === "PRIVATE" && password.length < 12) throw new Error("Private pages require a password of at least 12 characters");
  if (isHub && hubParentId) throw new Error("A hub cannot belong to another hub");

  const passwordHash = type === "PRIVATE" ? await hashPassword(password) : null;
  const initialDesign = templateDesign("CENTERED_SUMMARY", "#0052CC");
  const pageId = await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    if (hubParentId) {
      const parent = await transaction.selectFrom("pages").select("id")
        .where("id", "=", hubParentId).where("orgId", "=", session.orgId)
        .where("isHub", "=", true).where("deletedAt", "is", null).executeTakeFirst();
      if (!parent) throw new Error("Selected hub was not found in your organization");
    }
    const slugExists = await transaction.selectFrom("pages").select("id").where("slug", "=", slug).executeTakeFirst();
    if (slugExists) slug = `${slug}-${randomBytes(3).toString("hex")}`;
    const now = new Date();
    const page = await transaction.insertInto("pages").values({
      orgId: session.orgId,
      name,
      slug,
      type,
      isHub,
      hubParentId,
      timezone: "UTC",
      language: "en",
      headline: "Service Status",
      aboutText: "",
      coverImageFit: "CONTAIN",
      coverImagePositionX: 50,
      coverImagePositionY: 50,
      brandColor: "#0052CC",
      layout: "STANDARD",
      passwordHash,
      removeBranding: false,
      customCss: null,
      themePreset: "DEFAULT",
      themeMode: "SYSTEM",
      allowThemeOverride: true,
      analyticsEnabled: type === "PUBLIC",
      publishedDesign: initialDesign,
      publishedDesignVersion: 1,
      designPublishedAt: now,
      publicVisible: false,
      setupCompletedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
    }).returning("id").executeTakeFirstOrThrow();
    await audit(transaction, session, "CREATE_PAGE", slug, null, now);
    return page.id;
  });
  revalidatePath("/organization/pages");
  redirect(`/organization/pages/${pageId}`);
}

export async function finishPageSetup(pageId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  let publicPath = "";
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const page = await transaction.selectFrom("pages").selectAll()
      .where("id", "=", pageId).where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null).forUpdate().executeTakeFirst();
    if (!page) throw new Error("Page not found in your organization");
    if (page.setupCompletedAt !== null) throw new Error("Page setup is already complete");
    if (!page.isHub) {
      const component = await transaction.selectFrom("components").select("id")
        .where("pageId", "=", pageId).where("visible", "=", true).executeTakeFirst();
      if (!component) throw new Error("Add at least one visible component before publishing this status page");
    }
    const now = new Date();
    await transaction.updateTable("pages").set({ setupCompletedAt: now, publicVisible: true })
      .where("id", "=", pageId).executeTakeFirst();
    publicPath = page.isHub ? `/hub/${page.slug}` : `/${page.slug}`;
    await audit(transaction, session, "COMPLETE_PAGE_SETUP", pageId, { changes: [
      { field: "setupCompletedAt", before: null, after: now.toISOString() },
      { field: "publicVisible", before: false, after: true },
    ] }, now);
  });
  revalidatePath("/organization/pages");
  revalidatePath(`/organization/pages/${pageId}`);
  if (publicPath) revalidatePath(publicPath, "layout");
  redirect(`/organization/pages/${pageId}`);
}

export async function attachChildPage(hubId: string, formData: FormData) {
  const session = await requireCapability("page.configure", hubId);
  const childId = String(formData.get("childPageId") ?? "");
  if (!childId) throw new Error("Choose a status page to add");
  let hubPublicPath = "";
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const hub = await transaction.selectFrom("pages").selectAll()
      .where("id", "=", hubId).where("orgId", "=", session.orgId)
      .where("isHub", "=", true).where("deletedAt", "is", null).forUpdate().executeTakeFirst();
    if (!hub) throw new Error("Hub not found in your organization");
    hubPublicPath = `/hub/${hub.slug}`;
    const child = await transaction.selectFrom("pages").select("id")
      .where("id", "=", childId).where("orgId", "=", session.orgId)
      .where("isHub", "=", false).where("deletedAt", "is", null)
      .where((eb) => eb.or([eb("hubParentId", "is", null), eb("hubParentId", "=", hubId)]))
      .forUpdate().executeTakeFirst();
    if (!child) throw new Error("Status page is unavailable or already belongs to another hub");
    await transaction.updateTable("pages").set({ hubParentId: hubId }).where("id", "=", childId).execute();
  });
  revalidatePath(`/organization/pages/${hubId}`);
  revalidatePath(`/organization/pages/${hubId}/content`);
  revalidatePath("/organization/pages");
  if (hubPublicPath) revalidatePath(hubPublicPath, "layout");
}

export async function detachChildPage(hubId: string, childId: string) {
  const session = await requireCapability("page.configure", hubId);
  let hubPublicPath = "";
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const hub = await transaction.selectFrom("pages").select(["id", "slug"])
      .where("id", "=", hubId).where("orgId", "=", session.orgId)
      .where("isHub", "=", true).where("deletedAt", "is", null).executeTakeFirst();
    if (!hub) throw new Error("Hub not found in your organization");
    hubPublicPath = `/hub/${hub.slug}`;
    const changed = await transaction.updateTable("pages").set({ hubParentId: null })
      .where("id", "=", childId).where("orgId", "=", session.orgId)
      .where("isHub", "=", false).where("hubParentId", "=", hubId)
      .where("deletedAt", "is", null).returning("id").executeTakeFirst();
    if (!changed) throw new Error("Child status page not found on this hub");
  });
  revalidatePath(`/organization/pages/${hubId}`);
  revalidatePath(`/organization/pages/${hubId}/content`);
  revalidatePath("/organization/pages");
  if (hubPublicPath) revalidatePath(hubPublicPath, "layout");
}

export async function updatePageSettings(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const password = String(formData.get("password") ?? "");
  const removeBranding = formData.get("removeBranding") === "on";
  const customCss = formData.has("customCss") ? sanitizeCustomCss(String(formData.get("customCss") ?? "")) : undefined;
  const name = String(formData.get("name") ?? "").trim();
  const brandColor = validatedBrandColor(String(formData.get("brandColor") ?? "#0052CC"));
  const headline = String(formData.get("headline") ?? "");
  const aboutText = String(formData.get("aboutText") ?? "");
  if (!name || name.length > 120) throw new Error("Page name is required and must be 120 characters or fewer");
  if (headline.length > 180) throw new Error("Headline must be 180 characters or fewer");
  if (aboutText.length > 4_000) throw new Error("About text must be 4,000 characters or fewer");
  const supportUrl = validatedExternalUrl(String(formData.get("supportUrl") ?? ""), { allowMailto: true, label: "Support URL" });
  const termsUrl = validatedExternalUrl(String(formData.get("termsUrl") ?? ""), { label: "Terms URL" });
  const privacyUrl = validatedExternalUrl(String(formData.get("privacyUrl") ?? ""), { label: "Privacy URL" });
  const layout = validatedLayout(String(formData.get("layout") ?? "STANDARD"));
  const allowThemeOverride = formData.get("allowThemeOverride") === "on";
  const analyticsEnabled = formData.get("analyticsEnabled") === "on";
  const timezone = validatedTimezone(String(formData.get("timezone") ?? "UTC"));
  const language = validatedLanguage(String(formData.get("language") ?? "en"));
  const themePreset = String(formData.get("themePreset") ?? "DEFAULT");
  const themeMode = String(formData.get("themeMode") ?? "SYSTEM") as "SYSTEM" | "LIGHT" | "DARK";
  if (!PAGE_THEME_PRESET_KEYS.includes(themePreset as PageThemePresetKey)) throw new Error("Choose a valid theme preset");
  if (!["SYSTEM", "LIGHT", "DARK"].includes(themeMode)) throw new Error("Invalid theme mode");
  const componentEdits = parseComponentDetailEdits(formData);
  const passwordHash = password ? await hashPassword(password) : undefined;
  let publicPath = "";

  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const page = await transaction.selectFrom("pages").selectAll()
      .where("id", "=", pageId).where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null).forUpdate().executeTakeFirst();
    if (!page) throw new Error("Page not found in your organization");
    publicPath = page.isHub ? `/hub/${page.slug}` : `/${page.slug}`;
    const currentDesign = pageDesignFor(page);
    let nextDesign = currentDesign.templateKey === layout ? structuredClone(currentDesign) : templateDesign(layout, currentDesign.theme.palette.brand);
    if (currentDesign.templateKey !== layout) {
      nextDesign.theme = structuredClone(currentDesign.theme);
      nextDesign.seo = structuredClone(currentDesign.seo);
    }
    if (nextDesign.theme.preset !== themePreset) nextDesign = designWithThemePreset(nextDesign, themePreset as PageThemePresetKey);
    nextDesign.theme.palette.brand = brandColor;
    nextDesign.theme.mode = themeMode;
    nextDesign.theme.allowVisitorMode = allowThemeOverride;
    nextDesign = statusPageDesignSchema.parse(nextDesign);
    const designChanged = !sameStatusPageDesign(currentDesign, nextDesign);
    const nextVersion = designChanged ? page.publishedDesignVersion + 1 : page.publishedDesignVersion;
    const now = new Date();
    const currentComponents = await transaction.selectFrom("components")
      .select(["id", "name", "description", "groupId", "visible", "showUptime"])
      .where("pageId", "=", pageId).execute();
    const currentById = new Map(currentComponents.map((component) => [component.id, component]));
    if (componentEdits.some((component) => !currentById.has(component.id))) throw new Error("Components changed while you were editing; reload and try again");
    const selectedGroupIds = [...new Set(componentEdits.flatMap((component) => component.groupId ? [component.groupId] : []))];
    if (selectedGroupIds.length) {
      const groups = await transaction.selectFrom("componentGroups").select("id")
        .where("pageId", "=", pageId).where("id", "in", selectedGroupIds).execute();
      if (groups.length !== selectedGroupIds.length) throw new Error("A selected component group is no longer available");
    }
    if (componentEdits.length) {
      const rows = JSON.stringify(componentEdits);
      const result = await sql`
        with edits as (
          select * from jsonb_to_recordset(${rows}::jsonb)
          as x(id uuid, name text, description text, "groupId" uuid, visible boolean, "showUptime" boolean)
        )
        update components c set
          name = e.name, description = e.description, group_id = e."groupId",
          visible = e.visible, show_uptime = e."showUptime"
        from edits e where c.id = e.id and c.page_id = ${pageId}::uuid
        returning c.id
      `.execute(transaction);
      if (result.rows.length !== componentEdits.length) throw new Error("A component changed while settings were being saved");
    }
    await transaction.updateTable("pages").set({
      name, headline, aboutText, supportUrl, termsUrl, privacyUrl, brandColor, layout,
      themePreset, themeMode, allowThemeOverride, analyticsEnabled, timezone, language,
      removeBranding, publishedDesign: nextDesign, publishedDesignVersion: nextVersion,
      ...(designChanged ? { designPublishedAt: now } : {}),
      ...(customCss !== undefined ? { customCss } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    }).where("id", "=", pageId).execute();
    if (designChanged) {
      await retainDesignVersion(transaction, pageId, nextVersion, nextDesign, session.userId, now);
      await synchronizeDraft(transaction, pageId, nextDesign, nextVersion, session.userId, now);
    }
    const changes = componentEdits.flatMap((edit) => {
      const before = currentById.get(edit.id);
      if (!before) return [];
      return Object.entries({ name: edit.name, description: edit.description, groupId: edit.groupId, visible: edit.visible, showUptime: edit.showUptime })
        .filter(([field, after]) => before[field as keyof typeof before] !== after)
        .map(([field, after]) => ({ field: `component.${edit.id}.${field}`, before: before[field as keyof typeof before] ?? null, after }));
    });
    await audit(transaction, session, "UPDATE_PAGE_SETTINGS", pageId, { componentCount: componentEdits.length, changes }, now);
  });
  revalidatePath(`/organization/pages/${pageId}`);
  if (publicPath) revalidatePath(publicPath, "layout");
}

async function updatePublishedDesign(
  pageId: string,
  session: AdminSession,
  build: (page: Selectable<PageTable>) => StatusPageDesign,
  fields: Updateable<PageTable>,
  action: string
) {
  let publicPath = "";
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const page = await transaction.selectFrom("pages").selectAll()
      .where("id", "=", pageId).where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null).forUpdate().executeTakeFirst();
    if (!page) throw new Error("Page not found in your organization");
    publicPath = page.isHub ? `/hub/${page.slug}` : `/${page.slug}`;
    const nextDesign = statusPageDesignSchema.parse(build(page));
    const designChanged = !sameStatusPageDesign(pageDesignFor(page), nextDesign);
    const now = new Date();
    const nextVersion = designChanged ? page.publishedDesignVersion + 1 : page.publishedDesignVersion;
    await transaction.updateTable("pages").set({
      ...fields,
      publishedDesign: nextDesign,
      publishedDesignVersion: nextVersion,
      ...(designChanged ? { designPublishedAt: now } : {}),
    }).where("id", "=", pageId).execute();
    if (designChanged) {
      await retainDesignVersion(transaction, pageId, nextVersion, nextDesign, session.userId, now);
      await synchronizeDraft(transaction, pageId, nextDesign, nextVersion, session.userId, now);
    }
    await audit(transaction, session, action, pageId, fields, now);
  });
  return publicPath;
}

export async function updatePageAppearance(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const brandColor = validatedBrandColor(String(formData.get("brandColor") ?? "#0052CC"));
  const themePreset = String(formData.get("themePreset") ?? "DEFAULT");
  const themeMode = String(formData.get("themeMode") ?? "SYSTEM") as "SYSTEM" | "LIGHT" | "DARK";
  const allowThemeOverride = formData.get("allowThemeOverride") === "on";
  if (!PAGE_THEME_PRESET_KEYS.includes(themePreset as PageThemePresetKey)) throw new Error("Choose a valid style preset");
  if (!["SYSTEM", "LIGHT", "DARK"].includes(themeMode)) throw new Error("Choose a valid visitor appearance");
  const publicPath = await updatePublishedDesign(pageId, session, (page) => {
    const current = pageDesignFor(page);
    const next = current.theme.preset === themePreset ? structuredClone(current) : designWithThemePreset(current, themePreset as PageThemePresetKey);
    next.theme.palette.brand = brandColor;
    next.theme.mode = themeMode;
    next.theme.allowVisitorMode = allowThemeOverride;
    return next;
  }, { brandColor, themePreset, themeMode, allowThemeOverride }, "UPDATE_PAGE_APPEARANCE");
  revalidatePath(`/organization/pages/${pageId}/appearance`);
  revalidatePath(`/organization/pages/${pageId}/design`);
  if (publicPath) revalidatePath(publicPath, "layout");
}

export async function updatePageGeneralSettings(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const name = String(formData.get("name") ?? "").trim();
  const headline = String(formData.get("headline") ?? "").trim();
  const aboutText = String(formData.get("aboutText") ?? "").trim();
  if (!name || name.length > 120) throw new Error("Page name is required and must be 120 characters or fewer");
  if (headline.length > 180) throw new Error("Headline must be 180 characters or fewer");
  if (aboutText.length > 4_000) throw new Error("About text must be 4,000 characters or fewer");
  const timezone = validatedTimezone(String(formData.get("timezone") ?? "UTC"));
  const language = validatedLanguage(String(formData.get("language") ?? "en"));
  const removeBranding = formData.get("removeBranding") === "on";
  const analyticsEnabled = formData.get("analyticsEnabled") === "on";
  const seoTitle = String(formData.get("seoTitle") ?? "").trim();
  const seoDescription = String(formData.get("seoDescription") ?? "").trim();
  const seoSocialImageUrl = String(formData.get("seoSocialImageUrl") ?? "").trim();
  if (seoTitle.length > 160) throw new Error("Search title must be 160 characters or fewer");
  if (seoDescription.length > 320) throw new Error("Search description must be 320 characters or fewer");
  const noIndex = formData.get("noIndex") === "on";
  const publicPath = await updatePublishedDesign(pageId, session, (page) => {
    const current = pageDesignFor(page);
    return { ...current, seo: { ...current.seo, title: seoTitle, description: seoDescription, socialImageUrl: seoSocialImageUrl || null, noIndex } };
  }, { name, headline, aboutText, timezone, language, removeBranding, analyticsEnabled }, "UPDATE_PAGE_SETTINGS");
  revalidatePath(`/organization/pages/${pageId}/settings`);
  revalidatePath(`/organization/pages/${pageId}/design`);
  revalidatePath(`/organization/pages/${pageId}`);
  revalidatePath("/organization/pages");
  if (publicPath) revalidatePath(publicPath, "layout");
}

export async function updatePrivatePagePassword(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const password = String(formData.get("password") ?? "");
  if (password.length < 12) throw new Error("Page passwords must contain at least 12 characters");
  const passwordHash = await hashPassword(password);
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("pages").set({ passwordHash })
      .where("id", "=", pageId).where("orgId", "=", session.orgId)
      .where("type", "=", "PRIVATE").where("deletedAt", "is", null)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Private page not found in your organization");
  });
  revalidatePath(`/organization/pages/${pageId}/access`);
}

export async function deletePage(pageId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const now = new Date();
    const changed = await transaction.updateTable("pages").set({ deletedAt: now, deletedBy: session.userId })
      .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Page is already deleted or unavailable");
    await audit(transaction, session, "SOFT_DELETE_PAGE", pageId, { changes: [{ field: "deletedAt", before: null, after: now.toISOString() }] }, now);
  });
  revalidatePath("/organization/pages");
  revalidatePath("/organization/pages/deleted");
  redirect("/organization/pages");
}

export async function restorePage(pageId: string) {
  const session = await requireCapability("page.configure");
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const changed = await transaction.updateTable("pages").set({ deletedAt: null, deletedBy: null })
      .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is not", null)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Deleted page not found");
    await audit(transaction, session, "RESTORE_PAGE", pageId, { changes: [{ field: "deletedAt", before: "soft-deleted", after: null }] });
  });
  revalidatePath("/organization/pages");
  revalidatePath("/organization/pages/deleted");
}

export async function setPagePublicVisibility(pageId: string, visible: boolean) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  let publicPath = "";
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const page = await transaction.selectFrom("pages").selectAll()
      .where("id", "=", pageId).where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null).forUpdate().executeTakeFirst();
    if (!page) throw new Error("Page not found");
    if (visible && page.setupCompletedAt === null) throw new Error("Finish page setup before publishing it");
    publicPath = page.isHub ? `/hub/${page.slug}` : `/${page.slug}`;
    await transaction.updateTable("pages").set({ publicVisible: visible }).where("id", "=", pageId).execute();
    await audit(transaction, session, visible ? "SHOW_PAGE_PUBLICLY" : "HIDE_PAGE_PUBLICLY", pageId, {
      changes: [{ field: "publicVisible", before: page.publicVisible, after: visible }],
    });
  });
  revalidatePath("/organization/pages");
  revalidatePath(`/organization/pages/${pageId}`);
  if (publicPath) revalidatePath(publicPath, "layout");
}
