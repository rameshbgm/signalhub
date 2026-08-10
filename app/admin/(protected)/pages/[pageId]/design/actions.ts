"use server";

import { sql } from "kysely";
import { revalidatePath } from "next/cache";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { assetStorageForDriver } from "@/lib/asset-storage";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import {
  PAGE_DESIGN_VERSION_HISTORY_LIMIT,
  pageDesignFor,
  sameStatusPageDesign,
  statusPageDesignSchema,
  type StatusPageDesign,
} from "@/lib/page-design";
import { validatedExternalUrl } from "@/lib/page-validation";
import { database, type DatabaseTransaction } from "@/lib/postgres/client";
import { generateAutomationToken } from "@/lib/tokens";

export type DesignMutationResult =
  | { ok: true; revision: number; liveVersion?: number; unchanged?: boolean }
  | { ok: false; error: string; conflict?: boolean; revision?: number };

async function authorizedPage(pageId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").selectAll()
    .where("id", "=", pageId).where("orgId", "=", session.orgId)
    .where("deletedAt", "is", null).executeTakeFirst();
  if (!page) throw new Error("Page not found in your organization");
  return { session, page };
}

async function pruneDesignHistory(transaction: DatabaseTransaction, pageId: string) {
  await sql`
    delete from page_design_versions
    where page_id = ${pageId}::uuid
      and id not in (
        select id from page_design_versions where page_id = ${pageId}::uuid
        order by published_at desc, id desc limit ${PAGE_DESIGN_VERSION_HISTORY_LIMIT}
      )
  `.execute(transaction);
}

async function pruneUnreferencedDesignerAssets(pageId: string) {
  const [page, draft, versions, assets] = await Promise.all([
    database.selectFrom("pages").select("publishedDesign").where("id", "=", pageId).executeTakeFirst(),
    database.selectFrom("pageDesignDrafts").select("design").where("pageId", "=", pageId).executeTakeFirst(),
    database.selectFrom("pageDesignVersions").select("design").where("pageId", "=", pageId).execute(),
    database.selectFrom("assets").selectAll().where("pageId", "=", pageId).where("deletedAt", "is", null).execute(),
  ]);
  if (!page || versions.some((version) => !version.design || typeof version.design !== "object" || !("presentation" in version.design))) return;
  const designs = [page.publishedDesign, draft?.design, ...versions.map((version) => version.design)].flatMap((value) => {
    const parsed = statusPageDesignSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const referenced = new Set(designs.flatMap((design) => [
    design.presentation.logoUrl,
    design.presentation.faviconUrl,
    design.presentation.coverImageUrl,
  ].filter((value): value is string => Boolean(value))));
  for (const asset of assets) {
    if (referenced.has(asset.publicUrl)) continue;
    const removed = await database.updateTable("assets").set({ deletedAt: new Date() })
      .where("id", "=", asset.id).where("pageId", "=", pageId).where("deletedAt", "is", null)
      .returning("id").executeTakeFirst();
    if (removed) await assetStorageForDriver(asset.storageDriver).delete(asset.storageKey).catch(() => undefined);
  }
}

export async function saveDesignDraft(pageId: string, rawDesign: unknown, expectedRevision: number): Promise<DesignMutationResult> {
  try {
    const design = statusPageDesignSchema.parse(rawDesign);
    const { session } = await authorizedPage(pageId);
    const result = await withTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const page = await transaction.selectFrom("pages").select(["id", "publishedDesignVersion"])
        .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
        .forUpdate().executeTakeFirst();
      if (!page) throw new Error("Page not found in your organization");
      const currentDraft = await transaction.selectFrom("pageDesignDrafts").selectAll()
        .where("pageId", "=", pageId).forUpdate().executeTakeFirst();
      if ((expectedRevision === 0 && currentDraft) || (expectedRevision > 0 && currentDraft?.revision !== expectedRevision)) {
        return { conflict: true as const, revision: currentDraft?.revision };
      }
      if (currentDraft && currentDraft.basePublishedVersion !== page.publishedDesignVersion) {
        return { conflict: true as const, revision: currentDraft.revision };
      }
      const now = new Date();
      const draftChanged = !currentDraft || !sameStatusPageDesign(currentDraft.design, design);
      const revision = currentDraft ? currentDraft.revision + (draftChanged ? 1 : 0) : 1;
      if (!currentDraft) {
        await transaction.insertInto("pageDesignDrafts").values({
          pageId, revision, basePublishedVersion: page.publishedDesignVersion,
          design, updatedBy: session.userId, createdAt: now, updatedAt: now,
        }).execute();
      } else if (draftChanged) {
        const changed = await transaction.updateTable("pageDesignDrafts").set({
          design, revision, basePublishedVersion: page.publishedDesignVersion,
          updatedBy: session.userId, updatedAt: now,
        }).where("id", "=", currentDraft.id).where("revision", "=", expectedRevision)
          .returning("id").executeTakeFirst();
        if (!changed) return { conflict: true as const, revision: currentDraft.revision };
      }
      return { conflict: false as const, revision, liveVersion: page.publishedDesignVersion, unchanged: !draftChanged };
    });
    if (result.conflict) return { ok: false, error: "The design was updated in another session", conflict: true, revision: result.revision };
    revalidatePath(`/organization/pages/${pageId}/design`);
    revalidatePath(`/organization/pages/${pageId}/appearance`);
    return { ok: true, revision: result.revision, liveVersion: result.liveVersion, unchanged: result.unchanged };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save design draft" };
  }
}

export async function publishDesignDraft(pageId: string, expectedRevision: number): Promise<DesignMutationResult> {
  try {
    const { session } = await authorizedPage(pageId);
    const result = await withTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const page = await transaction.selectFrom("pages").selectAll()
        .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
        .forUpdate().executeTakeFirst();
      if (!page) throw new Error("Page not found in your organization");
      const draft = await transaction.selectFrom("pageDesignDrafts").selectAll()
        .where("pageId", "=", pageId).forUpdate().executeTakeFirst();
      if (!draft || draft.revision !== expectedRevision || draft.basePublishedVersion !== page.publishedDesignVersion) {
        return { conflict: true as const, revision: draft?.revision };
      }
      const design = statusPageDesignSchema.parse(draft.design);
      if (sameStatusPageDesign(design, pageDesignFor(page))) {
        return { conflict: false as const, revision: draft.revision, liveVersion: page.publishedDesignVersion, unchanged: true, slug: page.slug };
      }
      const now = new Date();
      const liveVersion = page.publishedDesignVersion + 1;
      await transaction.insertInto("pageDesignVersions").values({
        pageId, version: liveVersion, design, publishedBy: session.userId, publishedAt: now,
      }).execute();
      await pruneDesignHistory(transaction, pageId);
      const presentation = design.presentation;
      const changed = await transaction.updateTable("pages").set({
        publishedDesign: design, publishedDesignVersion: liveVersion, designPublishedAt: now,
        brandColor: design.theme.palette.brand, layout: design.templateKey,
        themePreset: design.theme.preset, themeMode: design.theme.mode,
        allowThemeOverride: design.theme.allowVisitorMode,
        logoUrl: presentation.logoUrl, faviconUrl: presentation.faviconUrl,
        coverImageUrl: presentation.coverImageUrl, coverImageFit: presentation.coverImageFit,
        coverImagePositionX: presentation.coverImagePositionX, coverImagePositionY: presentation.coverImagePositionY,
        coverImageCropX: presentation.coverImageCropX, coverImageCropY: presentation.coverImageCropY,
        coverImageCropWidth: presentation.coverImageCropWidth, coverImageCropHeight: presentation.coverImageCropHeight,
        supportUrl: presentation.supportUrl, termsUrl: presentation.termsUrl, privacyUrl: presentation.privacyUrl,
      }).where("id", "=", pageId).where("publishedDesignVersion", "=", page.publishedDesignVersion)
        .returning("id").executeTakeFirst();
      if (!changed) return { conflict: true as const, revision: draft.revision };
      await transaction.updateTable("pageDesignDrafts").set({
        basePublishedVersion: liveVersion, updatedBy: session.userId, updatedAt: now,
      }).where("id", "=", draft.id).where("revision", "=", draft.revision).execute();
      await transaction.insertInto("auditLogs").values({
        orgId: page.orgId, actor: session.email, action: "PUBLISH_PAGE_DESIGN", target: pageId,
        metadata: { version: liveVersion, templateKey: design.templateKey },
        supportSessionId: session.supportSessionId ?? null, createdAt: now,
      }).execute();
      return { conflict: false as const, revision: draft.revision, liveVersion, unchanged: false, slug: page.slug };
    });
    if (result.conflict) return { ok: false, error: "The design or live page changed in another session", conflict: true, revision: result.revision };
    if (!result.unchanged) {
      revalidatePath(`/${result.slug}`, "layout");
      revalidatePath(`/hub/${result.slug}`, "layout");
      revalidatePath(`/api/v1/embed/${result.slug}`);
    }
    revalidatePath(`/organization/pages/${pageId}/appearance`);
    revalidatePath(`/organization/pages/${pageId}/design`);
    if (!result.unchanged) await pruneUnreferencedDesignerAssets(pageId);
    return { ok: true, revision: result.revision, liveVersion: result.liveVersion, unchanged: result.unchanged };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not publish design" };
  }
}

export async function saveDesignerBranding(pageId: string, input: { name: string; headline: string; aboutText: string; supportUrl: string }) {
  try {
    const { session, page } = await authorizedPage(pageId);
    const name = input.name.trim();
    const headline = input.headline.trim();
    const aboutText = input.aboutText.trim();
    if (!name || name.length > 120) throw new Error("Page name is required and must be 120 characters or fewer");
    if (headline.length > 180) throw new Error("Headline must be 180 characters or fewer");
    if (aboutText.length > 4_000) throw new Error("About text must be 4,000 characters or fewer");
    const supportUrl = input.supportUrl.trim() ? validatedExternalUrl(input.supportUrl.trim(), { allowMailto: true, label: "Support URL" }) : null;
    await withTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const changed = await transaction.updateTable("pages").set({ name, headline, aboutText, supportUrl })
        .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
        .returning("id").executeTakeFirst();
      if (!changed) throw new Error("Page branding changed; reload and retry");
    });
    revalidatePath(`/${page.slug}`);
    revalidatePath(`/hub/${page.slug}`);
    revalidatePath(`/organization/pages/${pageId}/design`);
    return { ok: true } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save branding" } as const;
  }
}

export async function saveDesignerVisitorLinks(pageId: string, input: { supportUrl: string; termsUrl: string; privacyUrl: string }) {
  try {
    const { session, page } = await authorizedPage(pageId);
    const supportUrl = input.supportUrl.trim() ? validatedExternalUrl(input.supportUrl.trim(), { allowMailto: true, label: "Support URL" }) : null;
    const termsUrl = input.termsUrl.trim() ? validatedExternalUrl(input.termsUrl.trim(), { label: "Terms of Service URL" }) : null;
    const privacyUrl = input.privacyUrl.trim() ? validatedExternalUrl(input.privacyUrl.trim(), { label: "Privacy Policy URL" }) : null;
    await withTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const changed = await transaction.updateTable("pages").set({ supportUrl, termsUrl, privacyUrl })
        .where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null)
        .returning("id").executeTakeFirst();
      if (!changed) throw new Error("Visitor links changed; reload and retry");
    });
    revalidatePath(`/${page.slug}`, "layout");
    revalidatePath(`/hub/${page.slug}`, "layout");
    revalidatePath(`/organization/pages/${pageId}/design`);
    return { ok: true } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save visitor links" } as const;
  }
}

export async function reorderPageComponents(pageId: string, payload: {
  groups: Array<{ id: string; collapsed: boolean }>;
  components: Array<{ id: string; groupId: string | null }>;
}) {
  const { session, page } = await authorizedPage(pageId);
  if (page.isHub) {
    if (payload.groups.length || payload.components.length) return { ok: false, error: "Services belong to status pages, not hubs" } as const;
    return { ok: true } as const;
  }
  const groupIds = new Set(payload.groups.map((group) => group.id));
  if (groupIds.size !== payload.groups.length) throw new Error("Duplicate group ordering entry");
  if (new Set(payload.components.map((component) => component.id)).size !== payload.components.length) throw new Error("Duplicate component ordering entry");
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const [groups, components] = await Promise.all([
      transaction.selectFrom("componentGroups").select("id").where("pageId", "=", pageId).execute(),
      transaction.selectFrom("components").select("id").where("pageId", "=", pageId).execute(),
    ]);
    const componentIds = new Set(components.map((component) => component.id));
    if (groups.length !== payload.groups.length || components.length !== payload.components.length || groups.some((group) => !groupIds.has(group.id))) {
      throw new Error("Page structure changed; reload and retry");
    }
    if (payload.components.some((component) => !componentIds.has(component.id) || (component.groupId && !groupIds.has(component.groupId)))) {
      throw new Error("Invalid component ordering entry");
    }
    if (payload.groups.length) {
      const rows = JSON.stringify(payload.groups.map((group, order) => ({ ...group, order })));
      await sql`
        with updates as (select * from jsonb_to_recordset(${rows}::jsonb) as x(id uuid, collapsed boolean, "order" integer))
        update component_groups g set collapsed = u.collapsed, "order" = u."order"
        from updates u where g.id = u.id and g.page_id = ${pageId}::uuid
      `.execute(transaction);
    }
    if (payload.components.length) {
      const orderByGroup = new Map<string, number>();
      const rows = JSON.stringify(payload.components.map((component) => {
        const key = component.groupId ?? "ungrouped";
        const order = orderByGroup.get(key) ?? 0;
        orderByGroup.set(key, order + 1);
        return { ...component, order };
      }));
      await sql`
        with updates as (select * from jsonb_to_recordset(${rows}::jsonb) as x(id uuid, "groupId" uuid, "order" integer))
        update components c set group_id = u."groupId", "order" = u."order"
        from updates u where c.id = u.id and c.page_id = ${pageId}::uuid
      `.execute(transaction);
    }
  });
  revalidatePath(`/organization/pages/${pageId}`);
  revalidatePath(`/${page.slug}`);
  return { ok: true };
}

type AnnouncementInput = {
  title: string;
  body: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  ctaLabel?: string;
  ctaUrl?: string;
  startsAt: string;
  endsAt?: string;
  dismissible?: boolean;
  priority?: number;
};

function announcementValues(input: AnnouncementInput) {
  const title = input.title.trim();
  const ctaLabel = input.ctaLabel?.trim() || null;
  const rawCtaUrl = input.ctaUrl?.trim() || "";
  if (!title || title.length > 160) throw new Error("Announcement title is required and must be 160 characters or fewer");
  if (input.body.length > 2_000) throw new Error("Announcement body must be 2,000 characters or fewer");
  if (Boolean(ctaLabel) !== Boolean(rawCtaUrl)) throw new Error("Announcement CTA label and URL must be provided together");
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) throw new Error("Enter a valid announcement schedule");
  if (endsAt && endsAt <= startsAt) throw new Error("Announcement end must be after its start");
  return {
    title, body: input.body.trim(), severity: input.severity, ctaLabel,
    ctaUrl: rawCtaUrl ? validatedExternalUrl(rawCtaUrl, { label: "Announcement link" }) : null,
    startsAt, endsAt, dismissible: input.dismissible ?? false,
    priority: Math.max(-100, Math.min(100, input.priority ?? 0)),
  };
}

function revalidateAnnouncementPaths(pageId: string, slug: string) {
  revalidatePath(`/${slug}`);
  revalidatePath(`/hub/${slug}`);
  revalidatePath(`/organization/pages/${pageId}/design`);
  revalidatePath(`/organization/pages/${pageId}/content`);
}

export async function createAnnouncement(pageId: string, input: AnnouncementInput) {
  try {
    const { session, page } = await authorizedPage(pageId);
    const now = new Date();
    await withTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      await transaction.insertInto("pageAnnouncements").values({
        pageId, ...announcementValues(input), surfaces: ["STATUS", "HISTORY", "INCIDENT", "HUB"],
        createdBy: session.userId, createdAt: now, updatedAt: now,
      }).execute();
    });
    revalidateAnnouncementPaths(pageId, page.slug);
    return { ok: true } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create announcement" } as const;
  }
}

export async function updateAnnouncement(pageId: string, announcementId: string, input: AnnouncementInput) {
  try {
    const { session, page } = await authorizedPage(pageId);
    const result = await withTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      return transaction.updateTable("pageAnnouncements").set({ ...announcementValues(input), updatedAt: new Date() })
        .where("id", "=", announcementId).where("pageId", "=", pageId).returning("id").executeTakeFirst();
    });
    if (!result) throw new Error("Announcement not found");
    revalidateAnnouncementPaths(pageId, page.slug);
    return { ok: true } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update announcement" } as const;
  }
}

export async function deleteAnnouncement(pageId: string, announcementId: string) {
  const { session, page } = await authorizedPage(pageId);
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await transaction.deleteFrom("pageAnnouncements").where("id", "=", announcementId).where("pageId", "=", pageId).execute();
  });
  revalidateAnnouncementPaths(pageId, page.slug);
  return { ok: true };
}

export async function resetLegacyCss(pageId: string) {
  const { session, page } = await authorizedPage(pageId);
  await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    await transaction.updateTable("pages").set({ customCss: null }).where("id", "=", pageId).execute();
  });
  revalidatePath(`/${page.slug}`);
  revalidatePath(`/organization/pages/${pageId}/design`);
  return { ok: true };
}

export async function duplicateStatusPage(pageId: string) {
  const { session, page } = await authorizedPage(pageId);
  const [groups, components] = await Promise.all([
    database.selectFrom("componentGroups").selectAll().where("pageId", "=", pageId).orderBy("order").execute(),
    database.selectFrom("components").selectAll().where("pageId", "=", pageId).orderBy("order").execute(),
  ]);
  let slug = `${page.slug}-copy`;
  let suffix = 2;
  while (await database.selectFrom("pages").select("id").where("slug", "=", slug).executeTakeFirst()) slug = `${page.slug}-copy-${suffix++}`;
  const newPageId = await withTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(session.orgId, transaction);
    const now = new Date();
    const { id: sourcePageId, ...sourcePage } = page;
    void sourcePageId;
    const newPage = await transaction.insertInto("pages").values({
      ...sourcePage, name: `${page.name} Copy`, slug, type: "PUBLIC", isHub: false,
      hubParentId: null, passwordHash: null, publishedDesignVersion: 1,
      designPublishedAt: now, setupCompletedAt: null, publicVisible: false,
      deletedAt: null, deletedBy: null, createdAt: now,
    }).returning("id").executeTakeFirstOrThrow();
    const groupIdMap = new Map<string, string>();
    for (const group of groups) {
      const created = await transaction.insertInto("componentGroups").values({
        pageId: newPage.id, name: group.name, description: group.description,
        order: group.order, collapsed: group.collapsed,
      }).returning("id").executeTakeFirstOrThrow();
      groupIdMap.set(group.id, created.id);
    }
    for (const component of components) {
      const token = generateAutomationToken();
      const created = await transaction.insertInto("components").values({
        pageId: newPage.id, groupId: component.groupId ? groupIdMap.get(component.groupId) ?? null : null,
        name: component.name, description: component.description, status: "OPERATIONAL",
        order: component.order, visible: component.visible, showUptime: component.showUptime,
        manualStatus: "OPERATIONAL", isThirdParty: component.isThirdParty,
        thirdPartyProvider: component.thirdPartyProvider, automationTokenHash: token.hash,
        automationTokenPrefix: token.prefix, automationTokenLastFour: token.lastFour, createdAt: now,
      }).returning("id").executeTakeFirstOrThrow();
      await transaction.insertInto("componentStatusEvents").values({
        componentId: created.id, status: "OPERATIONAL", startedAt: now,
        endedAt: null, isMaintenance: false, note: null,
      }).execute();
    }
    await transaction.insertInto("auditLogs").values({
      orgId: page.orgId, actor: session.email, action: "DUPLICATE_PAGE", target: newPage.id,
      metadata: { sourcePageId: pageId }, supportSessionId: session.supportSessionId ?? null, createdAt: now,
    }).execute();
    return newPage.id;
  });
  revalidatePath("/organization/pages");
  return { ok: true, pageId: newPageId };
}

export type DesignActionInput = StatusPageDesign;
