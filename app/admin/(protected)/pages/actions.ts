"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability, assertPageInOrg } from "@/lib/admin-guard";
import { hashPassword } from "@/lib/auth";
import { deletePageCascade, withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { templateDesign } from "@/lib/page-design";
import { isValidTimeZone } from "@/lib/page-locale";
import { publicPagePath } from "@/lib/public-path";
import type { DatabaseTransaction } from "@/lib/postgres/client";
import type { PageTable } from "@/lib/postgres/schema";
import { recordTenantAudit } from "@/lib/tenant-audit";
import { generateAutomationToken } from "@/lib/tokens";

type AdminSession = Awaited<ReturnType<typeof requireCapability>>;

function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function audit(transaction: DatabaseTransaction, session: AdminSession, action: string, target: string, metadata: unknown = null) {
  await recordTenantAudit(transaction, session.orgId, {
    actorEmail: session.email,
    actorId: session.userId,
    actorMembershipRole: session.role,
    action,
    targetType: "page",
    targetId: target,
    metadata: { ...(metadata && typeof metadata === "object" ? metadata : {}), ...(session.supportSessionId ? { supportSessionId: session.supportSessionId } : {}) },
  });
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
  if (!name || name.length > 120) throw new Error("Page name is required and must be 120 characters or fewer");
  if (!slug || slug.length > 80) throw new Error("URL slug is required and must be 80 characters or fewer");
  if (!["PUBLIC", "PRIVATE", "AUDIENCE"].includes(type)) throw new Error("Invalid page type");
  if (!["STATUS", "HUB"].includes(kind)) throw new Error("Invalid page kind");
  if (isHub && hubParentId) throw new Error("A hub cannot belong to another hub");
  if (password && password.length < 12) throw new Error("Page passwords must contain at least 12 characters");
  if (type === "PRIVATE" && password.length < 12) throw new Error("Private pages require a password of at least 12 characters");
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
    if (await transaction.selectFrom("pages").select("id").where("slug", "=", slug).executeTakeFirst()) {
      slug = `${slug}-${randomBytes(3).toString("hex")}`;
    }
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
      headline: "Service status",
      aboutText: "",
      logoUrl: null,
      faviconUrl: null,
      coverImageUrl: null,
      brandColor: "#2563eb",
      layout: "STANDARD",
      supportUrl: null,
      termsUrl: null,
      privacyUrl: null,
      passwordHash,
      removeBranding: false,
      customCss: null,
      themePreset: "DEFAULT",
      analyticsEnabled: type === "PUBLIC",
      publishedDesign: initialDesign,
      publishedDesignVersion: 1,
      designPublishedAt: now,
      publicVisible: false,
      setupCompletedAt: null,
      onboardingStep: "WELCOME",
      organizationName: "",
      companyUrl: null,
      defaultSmsCountryCode: "+1",
      googleAnalyticsId: null,
      noindex: false,
      headerHtml: null,
      footerHtml: null,
      emailLogoUrl: null,
      emailFromName: null,
      emailReplyTo: null,
      emailFooter: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: now,
    }).returning("id").executeTakeFirstOrThrow();
    if (!isHub) {
      const token = generateAutomationToken();
      const component = await transaction.insertInto("components").values({
        pageId: page.id,
        groupId: null,
        name: "Service",
        description: "",
        status: "OPERATIONAL",
        order: 0,
        visible: true,
        showUptime: true,
        manualStatus: "OPERATIONAL",
        isThirdParty: false,
        thirdPartyProvider: null,
        automationTokenHash: token.hash,
        automationTokenPrefix: token.prefix,
        automationTokenLastFour: token.lastFour,
        createdAt: now,
      }).returning("id").executeTakeFirstOrThrow();
      await transaction.insertInto("componentStatusEvents").values({
        componentId: component.id,
        status: "OPERATIONAL",
        startedAt: now,
        endedAt: null,
        isMaintenance: false,
        note: null,
      }).execute();
    }
    await audit(transaction, session, "CREATE_PAGE_DRAFT", page.id, { slug });
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
      .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
      .forUpdate().executeTakeFirst();
    if (!page) throw new Error("Page not found in your organization");
    if (!page.isHub) {
      const component = await transaction.selectFrom("components").select("id")
        .where("pageId", "=", pageId).where("visible", "=", true).executeTakeFirst();
      if (!component) throw new Error("Add at least one visible component before publishing this page");
    }
    const now = new Date();
    await transaction.updateTable("pages").set({
      onboardingStep: "COMPLETE",
      setupCompletedAt: now,
      publicVisible: true,
    }).where("id", "=", pageId).where("orgId", "=", session.orgId).executeTakeFirstOrThrow();
    publicPath = publicPagePath(page);
    await audit(transaction, session, "PUBLISH_PAGE", pageId, { slug: page.slug });
  });
  if (publicPath) revalidatePath(publicPath, "layout");
  revalidatePath("/organization/pages");
  redirect(`/organization/pages/${pageId}`);
}

export async function attachChildPage(hubId: string, formData: FormData) {
  const session = await requireCapability("page.configure", hubId);
  const childId = String(formData.get("childPageId") ?? "");
  if (!childId) throw new Error("Choose a status page to add");
  let publicPath = "";
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const hub = await transaction.selectFrom("pages").selectAll()
      .where("id", "=", hubId).where("orgId", "=", session.orgId).where("isHub", "=", true)
      .where("deletedAt", "is", null).forUpdate().executeTakeFirst();
    if (!hub) throw new Error("Hub not found in your organization");
    const child = await transaction.selectFrom("pages").select("id")
      .where("id", "=", childId).where("orgId", "=", session.orgId).where("isHub", "=", false)
      .where("deletedAt", "is", null).where((eb) => eb.or([eb("hubParentId", "is", null), eb("hubParentId", "=", hubId)]))
      .forUpdate().executeTakeFirst();
    if (!child) throw new Error("Status page is unavailable or already belongs to another hub");
    await transaction.updateTable("pages").set({ hubParentId: hubId }).where("id", "=", childId).execute();
    publicPath = publicPagePath(hub);
    await audit(transaction, session, "ATTACH_PAGE_TO_HUB", childId, { hubId });
  });
  revalidatePath("/organization/pages");
  revalidatePath(`/organization/pages/${hubId}`);
  revalidatePath(`/organization/pages/${hubId}/content`);
  if (publicPath) revalidatePath(publicPath, "layout");
}

export async function detachChildPage(hubId: string, childId: string) {
  const session = await requireCapability("page.configure", hubId);
  let publicPath = "";
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const hub = await transaction.selectFrom("pages").selectAll()
      .where("id", "=", hubId).where("orgId", "=", session.orgId).where("isHub", "=", true)
      .where("deletedAt", "is", null).forUpdate().executeTakeFirst();
    if (!hub) throw new Error("Hub not found in your organization");
    const changed = await transaction.updateTable("pages").set({ hubParentId: null })
      .where("id", "=", childId).where("orgId", "=", session.orgId).where("isHub", "=", false)
      .where("hubParentId", "=", hubId).where("deletedAt", "is", null)
      .returning("id").executeTakeFirst();
    if (!changed) throw new Error("Child status page not found on this hub");
    publicPath = publicPagePath(hub);
    await audit(transaction, session, "DETACH_PAGE_FROM_HUB", childId, { hubId });
  });
  revalidatePath("/organization/pages");
  revalidatePath(`/organization/pages/${hubId}`);
  revalidatePath(`/organization/pages/${hubId}/content`);
  if (publicPath) revalidatePath(publicPath, "layout");
}

export async function setPagePublicVisibility(pageId: string, visible: boolean) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (visible && page.setupCompletedAt === null) throw new Error("Finish setup before publishing this page");
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    if (page.deletedAt !== null) throw new Error("Page not found in your organization");
    await transaction.updateTable("pages").set({ publicVisible: visible })
      .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null).executeTakeFirstOrThrow();
    await audit(transaction, session, visible ? "SHOW_PAGE" : "HIDE_PAGE", pageId);
  });
  revalidatePath(`/organization/pages/${pageId}`);
  revalidatePath(publicPagePath(page), "layout");
}

export async function updatePageInfo(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 120) throw new Error("Page name is required");
  const timezone = String(formData.get("timezone") ?? "UTC").trim() || "UTC";
  if (!isValidTimeZone(timezone)) throw new Error(`Unknown time zone "${timezone}". Use an IANA name such as Europe/Berlin.`);
  const headline = String(formData.get("headline") ?? page.headline ?? "").trim();
  if (headline.length > 180) throw new Error("Headline must be 180 characters or fewer");
  const aboutText = String(formData.get("aboutText") ?? page.aboutText ?? "").trim();
  if (aboutText.length > 4_000) throw new Error("About text must be 4,000 characters or fewer");
  const values = {
    name,
    organizationName: String(formData.get("organizationName") ?? "").trim(),
    companyUrl: optionalUrl(formData.get("companyUrl")),
    defaultSmsCountryCode: String(formData.get("defaultSmsCountryCode") ?? "+1").trim(),
    timezone,
    headline,
    aboutText,
    noindex: formData.get("noindex") === "on",
    ...(formData.has("supportUrl") ? { supportUrl: optionalUrl(formData.get("supportUrl")) } : {}),
    ...(formData.has("privacyUrl") ? { privacyUrl: optionalUrl(formData.get("privacyUrl")) } : {}),
  };
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await transaction.updateTable("pages").set(values).where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null).executeTakeFirstOrThrow();
    await audit(transaction, session, "UPDATE_PAGE_INFO", pageId);
  });
  revalidatePath(`/organization/pages/${pageId}/settings`);
  revalidatePath(`/organization/pages/${pageId}`, "layout");
  revalidatePath(`/${page.slug}`, "layout");
}

export async function updateEmailCustomization(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const emailFromName = optionalText(formData.get("emailFromName"));
  // The sender name goes into an email header, so reject header-breaking characters.
  if (emailFromName && (emailFromName.length > 80 || /[\r\n"<>]/.test(emailFromName))) {
    throw new Error("Sender name must be 80 characters or fewer without quotes, angle brackets, or line breaks");
  }
  const emailReplyTo = optionalText(formData.get("emailReplyTo"));
  if (emailReplyTo && (emailReplyTo.length > 254 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(emailReplyTo))) {
    throw new Error("Enter a valid reply-to email address");
  }
  const emailFooter = optionalText(formData.get("emailFooter"));
  if (emailFooter && emailFooter.length > 1_000) throw new Error("Email footer must be 1,000 characters or fewer");
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await transaction.updateTable("pages").set({ emailFromName, emailReplyTo, emailFooter })
      .where("id", "=", pageId).where("orgId", "=", session.orgId).executeTakeFirstOrThrow();
    await audit(transaction, session, "UPDATE_EMAIL_CUSTOMIZATION", pageId);
  });
  revalidatePath(`/organization/pages/${pageId}/notifications`);
}

export async function deletePage(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (String(formData.get("confirmation") ?? "").trim() !== page.name) {
    throw new Error("Type the exact page name to permanently delete it");
  }
  await deletePageCascade(pageId, session.orgId, {
    afterDelete: async (transaction) => {
      await audit(transaction, session, "DELETE_PAGE", pageId);
    },
  });
  revalidatePath("/organization/pages");
  redirect("/organization/pages");
}

export async function updatePrivatePagePassword(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
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

function optionalText(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || null;
}

function optionalUrl(value: FormDataEntryValue | null) {
  const result = optionalText(value);
  if (!result) return null;
  const url = new URL(result);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed");
  return url.toString();
}
