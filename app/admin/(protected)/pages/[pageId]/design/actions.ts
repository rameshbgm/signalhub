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
import { database, type DatabaseTransaction } from "@/lib/postgres/client";

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
        themePreset: design.theme.preset,
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
      return { conflict: false as const, revision: draft.revision, liveVersion, unchanged: false, slug: page.slug, hubParentId: page.hubParentId };
    });
    if (result.conflict) return { ok: false, error: "The design or live page changed in another session", conflict: true, revision: result.revision };
    if (!result.unchanged) {
      revalidatePath(`/${result.slug}`, "layout");
      revalidatePath(`/hub/${result.slug}`, "layout");
      revalidatePath(`/api/v1/embed/${result.slug}`);
      // A hub shows its member pages, so their new look must reach it too.
      if ("hubParentId" in result && result.hubParentId) {
        const hub = await database.selectFrom("pages").select("slug").where("id", "=", result.hubParentId).executeTakeFirst();
        if (hub) revalidatePath(`/hub/${hub.slug}`, "layout");
      }
    }
    revalidatePath(`/organization/pages/${pageId}/appearance`);
    revalidatePath(`/organization/pages/${pageId}/design`);
    if (!result.unchanged) await pruneUnreferencedDesignerAssets(pageId);
    return { ok: true, revision: result.revision, liveVersion: result.liveVersion, unchanged: result.unchanged };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not publish design" };
  }
}

export type DesignActionInput = StatusPageDesign;
