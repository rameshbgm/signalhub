"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability, assertPageInOrg } from "@/lib/admin-guard";
import { hashPassword } from "@/lib/auth";
import { deletePageCascade, withTransaction } from "@/lib/cascade";
import { isDatabaseId } from "@/lib/database-id";
import { INPUT_LIMITS, isValidSmsCountryCode } from "@/lib/input-limits";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { BULK_PAGE_LIMIT, bulkDeletePhrase, isBulkPageIntent, matchesBulkDeletePhrase, pageCountLabel } from "@/lib/page-bulk";
import { templateDesign } from "@/lib/page-design";
import { isValidTimeZone } from "@/lib/page-locale";
import { publicPagePath } from "@/lib/public-path";
import { database, type DatabaseTransaction } from "@/lib/postgres/client";
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
  if (hubParentId && !isDatabaseId(hubParentId)) throw new Error("Hub not found in your organization");
  if (password && password.length < 12) throw new Error("Page passwords must contain at least 12 characters");
  if (type === "PRIVATE" && password.length < 12) throw new Error("Private pages require a password of at least 12 characters");
  if (password.length > INPUT_LIMITS.password) throw new Error(`Page passwords must be ${INPUT_LIMITS.password} characters or fewer`);
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
  if (!isDatabaseId(childId)) throw new Error("Status page is unavailable or already belongs to another hub");
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
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  if (organizationName.length > INPUT_LIMITS.name) throw new Error(`Organization name must be ${INPUT_LIMITS.name} characters or fewer`);
  const defaultSmsCountryCode = String(formData.get("defaultSmsCountryCode") ?? "+1").trim();
  if (!isValidSmsCountryCode(defaultSmsCountryCode)) throw new Error("Default SMS country code must look like +1 or +353");
  const values = {
    name,
    organizationName,
    companyUrl: optionalUrl(formData.get("companyUrl")),
    defaultSmsCountryCode,
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

// ponytail: checked outside the delete transaction; a page attached in that gap falls back to standalone via the FK's ON DELETE SET NULL, not lost.
async function assertHubEmpty(hubId: string) {
  const { count } = await database.selectFrom("pages").select((eb) => eb.fn.countAll<string>().as("count"))
    .where("hubParentId", "=", hubId).where("deletedAt", "is", null).executeTakeFirstOrThrow();
  const children = Number(count);
  if (children > 0) throw new Error(`Remove or delete this hub's ${children} page${children === 1 ? "" : "s"} before deleting it`);
}

/** Bulk action over pages from the pages list. With hubId, every selected page must be a child of that hub. */
export async function bulkPageAction(hubId: string | null, formData: FormData) {
  const intent = formData.get("intent");
  if (!isBulkPageIntent(intent)) throw new Error("Choose a bulk action");
  if (hubId !== null && !isDatabaseId(hubId)) throw new Error("Hub not found in your organization");
  if (intent === "remove" && !hubId) throw new Error("Only pages inside a hub can be removed from a hub");
  const pageIds = [...new Set(formData.getAll("pageId").map(String))];
  if (!pageIds.length) throw new Error("Select at least one page");
  if (pageIds.length > BULK_PAGE_LIMIT) throw new Error(`Select ${BULK_PAGE_LIMIT} pages or fewer`);
  if (!pageIds.every(isDatabaseId)) throw new Error("One or more selected pages are invalid. Reload and try again.");
  let session = await requireCapability("page.configure", hubId ?? undefined);
  for (const id of pageIds) session = await requireCapability("page.configure", id);
  if (hubId) {
    const hub = await database.selectFrom("pages").select("id")
      .where("id", "=", hubId).where("orgId", "=", session.orgId).where("isHub", "=", true).where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!hub) throw new Error("Hub not found in your organization");
    const members = await database.selectFrom("pages").select("id")
      .where("id", "in", pageIds).where("hubParentId", "=", hubId).where("deletedAt", "is", null).execute();
    if (members.length !== pageIds.length) throw new Error("Some selected pages are no longer in this hub. Reload and try again.");
  }
  const label = pageCountLabel(pageIds.length);
  const publicPaths = new Set<string>();
  let message: string;

  if (intent === "delete") {
    if (!matchesBulkDeletePhrase(String(formData.get("confirmation") ?? ""), pageIds.length)) {
      throw new Error(`Type "${bulkDeletePhrase(pageIds.length)}" to confirm`);
    }
    let deleted = 0;
    try {
      for (const id of pageIds) {
        const page = await assertPageInOrg(id, session.orgId);
        if (page.isHub) await assertHubEmpty(id);
        await deletePageCascade(id, session.orgId, { afterDelete: (transaction) => audit(transaction, session, "DELETE_PAGE", id) });
        publicPaths.add(publicPagePath(page));
        deleted += 1;
      }
    } catch (error) {
      revalidatePath("/organization/pages");
      throw new Error(`Deleted ${deleted} of ${pageIds.length}: ${error instanceof Error ? error.message : "unexpected error"}`);
    }
    message = `Deleted ${label}`;
  } else {
    message = await withTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      let query = transaction.updateTable("pages")
        .where("id", "in", pageIds).where("orgId", "=", session.orgId).where("deletedAt", "is", null);
      // Filters match the UI's enabled states: publish needs finished setup and a hidden page, hide needs a visible one.
      if (intent === "remove") query = query.where("hubParentId", "=", hubId).where("isHub", "=", false);
      if (intent === "publish") query = query.where("setupCompletedAt", "is not", null).where("publicVisible", "=", false);
      if (intent === "hide") query = query.where("publicVisible", "=", true);
      const changed = await query
        .set(intent === "remove" ? { hubParentId: null } : { publicVisible: intent === "publish" })
        .returning(["id", "slug", "isHub"]).execute();
      const action = intent === "remove" ? "DETACH_PAGE_FROM_HUB" : intent === "publish" ? "SHOW_PAGE" : "HIDE_PAGE";
      for (const page of changed) {
        await audit(transaction, session, action, page.id, intent === "remove" ? { hubId } : null);
        publicPaths.add(publicPagePath(page));
      }
      const verb = intent === "remove" ? "Removed" : intent === "publish" ? "Published" : "Hid";
      const skipped = pageIds.length - changed.length;
      const reason = intent === "publish" ? "already published or still in setup" : intent === "hide" ? "already hidden" : "not in this hub";
      return `${verb} ${pageCountLabel(changed.length)}${skipped ? `, skipped ${skipped} ${reason}` : ""}`;
    });
  }

  if (hubId) {
    const hub = await database.selectFrom("pages").select(["slug", "isHub"]).where("id", "=", hubId).executeTakeFirst();
    if (hub) publicPaths.add(publicPagePath(hub));
    revalidatePath(`/organization/pages/${hubId}`);
  }
  for (const path of publicPaths) revalidatePath(path, "layout");
  revalidatePath("/organization/pages");
  return message;
}

export async function deletePage(pageId: string, formData: FormData) {
  const session = await requireCapability("page.configure", pageId);
  const page = await assertPageInOrg(pageId, session.orgId);
  if (String(formData.get("confirmation") ?? "").trim() !== page.name) {
    throw new Error("Type the exact page name to permanently delete it");
  }
  if (page.isHub) await assertHubEmpty(pageId);
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
  if (password.length > INPUT_LIMITS.password) throw new Error(`Page passwords must be ${INPUT_LIMITS.password} characters or fewer`);
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
  if (result.length > INPUT_LIMITS.url) throw new Error(`URLs must be ${INPUT_LIMITS.url} characters or fewer`);
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new Error(`Enter a full URL such as https://example.com (got "${result.slice(0, 80)}")`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are allowed");
  return url.toString();
}
