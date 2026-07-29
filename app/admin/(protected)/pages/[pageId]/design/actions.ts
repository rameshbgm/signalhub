"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { collections } from "@/lib/db";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { oid } from "@/lib/mongo-utils";
import {
  PAGE_DESIGN_VERSION_HISTORY_LIMIT,
  pageDesignFor,
  sameStatusPageDesign,
  statusPageDesignSchema,
  type StatusPageDesign,
} from "@/lib/page-design";
import { validatedExternalUrl } from "@/lib/page-validation";
import { generateAutomationToken } from "@/lib/tokens";

export type DesignMutationResult =
  | { ok: true; revision: number; liveVersion?: number; unchanged?: boolean }
  | { ok: false; error: string; conflict?: boolean; revision?: number };

async function authorizedPage(pageId: string) {
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await collections.pages().findOne({
    _id: oid(pageId),
    orgId: oid(session.orgId),
  });
  if (!page) throw new Error("Page not found in your organization");
  return { session, page };
}

export async function saveDesign(
  pageId: string,
  rawDesign: unknown,
  expectedRevision: number
): Promise<DesignMutationResult> {
  try {
    const design = statusPageDesignSchema.parse(rawDesign);
    const { session } = await authorizedPage(pageId);
    const result = await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const page = await collections.pages().findOne(
        { _id: oid(pageId), orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!page) throw new Error("Page not found in your organization");
      const currentDraft = await collections.pageDesignDrafts().findOne(
        { pageId: page._id },
        { session: databaseSession }
      );
      if ((expectedRevision === 0 && currentDraft) || (expectedRevision > 0 && currentDraft?.revision !== expectedRevision)) {
        return { conflict: true as const, revision: currentDraft?.revision };
      }

      const now = new Date();
      const actorId = oid(session.userId);
      const draftChanged = !currentDraft || !sameStatusPageDesign(currentDraft.design, design);
      const publishedDesign = page.publishedDesign
        ? statusPageDesignSchema.parse(page.publishedDesign)
        : pageDesignFor(page);
      const liveChanged = !sameStatusPageDesign(design, publishedDesign);
      const revision = currentDraft ? currentDraft.revision + (draftChanged ? 1 : 0) : 1;
      const liveVersion = liveChanged ? (page.publishedDesignVersion ?? 0) + 1 : (page.publishedDesignVersion ?? 1);

      if (!currentDraft) {
        await collections.pageDesignDrafts().insertOne({
          _id: new ObjectId(),
          pageId: page._id,
          revision,
          basePublishedVersion: liveVersion,
          design,
          updatedBy: actorId,
          createdAt: now,
          updatedAt: now,
        }, { session: databaseSession });
      } else if (draftChanged) {
        const changed = await collections.pageDesignDrafts().updateOne(
          { _id: currentDraft._id, revision: expectedRevision },
          { $set: { design, revision, basePublishedVersion: liveVersion, updatedBy: actorId, updatedAt: now } },
          { session: databaseSession }
        );
        if (changed.matchedCount !== 1) return { conflict: true as const, revision: currentDraft.revision };
      } else if (currentDraft.basePublishedVersion !== liveVersion) {
        await collections.pageDesignDrafts().updateOne(
          { _id: currentDraft._id },
          { $set: { basePublishedVersion: liveVersion } },
          { session: databaseSession }
        );
      }

      if (liveChanged) {
        await collections.pageDesignVersions().insertOne({
          _id: new ObjectId(),
          pageId: page._id,
          version: liveVersion,
          design,
          publishedBy: actorId,
          publishedAt: now,
        }, { session: databaseSession });
        const expiredVersions = await collections.pageDesignVersions()
          .find({ pageId: page._id }, { session: databaseSession })
          .sort({ publishedAt: -1, _id: -1 })
          .skip(PAGE_DESIGN_VERSION_HISTORY_LIMIT)
          .project({ _id: 1 })
          .toArray();
        if (expiredVersions.length) {
          await collections.pageDesignVersions().deleteMany(
            { pageId: page._id, _id: { $in: expiredVersions.map((version) => version._id) } },
            { session: databaseSession }
          );
        }
        const savedPage = await collections.pages().updateOne(
          { _id: page._id, orgId: page.orgId },
          {
            $set: {
              publishedDesign: design,
              publishedDesignVersion: liveVersion,
              designPublishedAt: now,
              brandColor: design.theme.palette.brand,
              layout: design.templateKey,
              themePreset: design.theme.preset,
              themeMode: design.theme.mode,
              allowThemeOverride: design.theme.allowVisitorMode,
            },
          },
          { session: databaseSession }
        );
        if (savedPage.matchedCount !== 1) throw new Error("The status page changed before the design could be saved");
        await collections.auditLogs().insertOne({
          _id: new ObjectId(),
          orgId: page.orgId,
          actor: session.email,
          action: "SAVE_PAGE_DESIGN",
          target: pageId,
          metadata: { version: liveVersion, templateKey: design.templateKey },
          supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
          createdAt: now,
        }, { session: databaseSession });
      }

      return {
        conflict: false as const,
        revision,
        liveVersion,
        unchanged: !draftChanged && !liveChanged,
        liveChanged,
        slug: page.slug,
      };
    });
    if (result.conflict) {
      return { ok: false, error: "The design was updated in another session", conflict: true, revision: result.revision };
    }
    if (result.liveChanged) {
      revalidatePath(`/${result.slug}`, "layout");
      revalidatePath(`/hub/${result.slug}`, "layout");
      revalidatePath(`/api/v1/embed/${result.slug}`);
    }
    revalidatePath(`/organization/pages/${pageId}/design`);
    return { ok: true, revision: result.revision, liveVersion: result.liveVersion, unchanged: result.unchanged };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save design" };
  }
}

export async function saveDesignerBranding(pageId: string, input: {
  name: string;
  headline: string;
  aboutText: string;
  supportUrl: string;
}) {
  try {
    const { session, page } = await authorizedPage(pageId);
    const name = input.name.trim();
    const headline = input.headline.trim();
    const aboutText = input.aboutText.trim();
    if (!name || name.length > 120) throw new Error("Page name is required and must be 120 characters or fewer");
    if (headline.length > 180) throw new Error("Headline must be 180 characters or fewer");
    if (aboutText.length > 4_000) throw new Error("About text must be 4,000 characters or fewer");
    const supportUrl = input.supportUrl.trim()
      ? validatedExternalUrl(input.supportUrl.trim(), { allowMailto: true, label: "Support URL" })
      : null;
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const changed = await collections.pages().updateOne(
        { _id: page._id, orgId: page.orgId },
        { $set: { name, headline, aboutText, supportUrl } },
        { session: databaseSession }
      );
      if (!changed.matchedCount) throw new Error("Page branding changed; reload and retry");
    });
    revalidatePath(`/${page.slug}`);
    revalidatePath(`/hub/${page.slug}`);
    revalidatePath(`/organization/pages/${pageId}/design`);
    return { ok: true } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save branding" } as const;
  }
}

export async function reorderPageComponents(
  pageId: string,
  payload: {
    groups: Array<{ id: string; collapsed: boolean }>;
    components: Array<{ id: string; groupId: string | null }>;
  }
) {
  const { session, page } = await authorizedPage(pageId);
  if (page.isHub) {
    if (payload.groups.length || payload.components.length) {
      return { ok: false, error: "Services belong to status pages, not hubs" } as const;
    }
    return { ok: true } as const;
  }
  const groupIds = new Set(payload.groups.map((group) => group.id));
  if (groupIds.size !== payload.groups.length) throw new Error("Duplicate group ordering entry");
  if (new Set(payload.components.map((component) => component.id)).size !== payload.components.length) {
    throw new Error("Duplicate component ordering entry");
  }
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const groups = await collections.componentGroups()
      .find({ pageId: page._id }, { session: databaseSession })
      .toArray();
    const components = await collections.components()
      .find({ pageId: page._id }, { session: databaseSession })
      .toArray();
    if (
      groups.length !== payload.groups.length ||
      components.length !== payload.components.length ||
      groups.some((group) => !groupIds.has(group._id.toHexString()))
    ) {
      throw new Error("Page structure changed; reload and retry");
    }
    const componentIds = new Set(components.map((component) => component._id.toHexString()));
    if (payload.components.some((component) => !componentIds.has(component.id) || (component.groupId && !groupIds.has(component.groupId)))) {
      throw new Error("Invalid component ordering entry");
    }
    for (const [index, group] of payload.groups.entries()) {
      await collections.componentGroups().updateOne(
        { _id: oid(group.id), pageId: page._id },
        { $set: { order: index, collapsed: group.collapsed } },
        { session: databaseSession }
      );
    }
    const orderByGroup = new Map<string, number>();
    for (const component of payload.components) {
      const key = component.groupId ?? "ungrouped";
      const order = orderByGroup.get(key) ?? 0;
      orderByGroup.set(key, order + 1);
      await collections.components().updateOne(
        { _id: oid(component.id), pageId: page._id },
        { $set: { groupId: component.groupId ? oid(component.groupId) : null, order } },
        { session: databaseSession }
      );
    }
  });
  revalidatePath(`/organization/pages/${pageId}`);
  revalidatePath(`/${page.slug}`);
  return { ok: true };
}

export async function createAnnouncement(pageId: string, input: {
  title: string;
  body: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  ctaLabel?: string;
  ctaUrl?: string;
  startsAt: string;
  endsAt?: string;
  dismissible?: boolean;
  priority?: number;
}) {
  try {
    const { session, page } = await authorizedPage(pageId);
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
    const now = new Date();
    await collections.pageAnnouncements().insertOne({
      _id: new ObjectId(),
      pageId: page._id,
      title,
      body: input.body.trim(),
      severity: input.severity,
      ctaLabel,
      ctaUrl: rawCtaUrl ? validatedExternalUrl(rawCtaUrl, { label: "Announcement link" }) : null,
      startsAt,
      endsAt,
      dismissible: input.dismissible ?? false,
      priority: Math.max(-100, Math.min(100, input.priority ?? 0)),
      surfaces: ["STATUS", "HISTORY", "INCIDENT", "HUB"],
      createdBy: oid(session.userId),
      createdAt: now,
      updatedAt: now,
    });
    revalidatePath(`/${page.slug}`);
    revalidatePath(`/hub/${page.slug}`);
    revalidatePath(`/organization/pages/${pageId}/design`);
    return { ok: true } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create announcement" } as const;
  }
}

export async function deleteAnnouncement(pageId: string, announcementId: string) {
  const { page } = await authorizedPage(pageId);
  await collections.pageAnnouncements().deleteOne({ _id: oid(announcementId), pageId: page._id });
  revalidatePath(`/${page.slug}`);
  revalidatePath(`/hub/${page.slug}`);
  revalidatePath(`/organization/pages/${pageId}/design`);
  return { ok: true };
}

export async function resetLegacyCss(pageId: string) {
  const { page } = await authorizedPage(pageId);
  await collections.pages().updateOne({ _id: page._id }, { $set: { customCss: null } });
  revalidatePath(`/${page.slug}`);
  revalidatePath(`/organization/pages/${pageId}/design`);
  return { ok: true };
}

export async function duplicateStatusPage(pageId: string) {
  const { session, page } = await authorizedPage(pageId);
  const [groups, components] = await Promise.all([
    collections.componentGroups().find({ pageId: page._id }).sort({ order: 1 }).toArray(),
    collections.components().find({ pageId: page._id }).sort({ order: 1 }).toArray(),
  ]);
  let slug = `${page.slug}-copy`;
  let suffix = 2;
  while (await collections.pages().findOne({ slug }, { projection: { _id: 1 } })) {
    slug = `${page.slug}-copy-${suffix++}`;
  }
  const newPageId = new ObjectId();
  await withTransaction(async (databaseSession) => {
    await fenceActiveOrganizationMutation(session.orgId, databaseSession);
    const now = new Date();
    await collections.pages().insertOne(
      {
        ...page,
        _id: newPageId,
        name: `${page.name} Copy`,
        slug,
        type: "PUBLIC",
        isHub: false,
        hubParentId: null,
        passwordHash: null,
        publishedDesignVersion: 1,
        designPublishedAt: now,
        createdAt: now,
      },
      { session: databaseSession }
    );
    const groupIdMap = new Map<string, ObjectId>();
    for (const group of groups) {
      const newGroupId = new ObjectId();
      groupIdMap.set(group._id.toHexString(), newGroupId);
      await collections.componentGroups().insertOne(
        { ...group, _id: newGroupId, pageId: newPageId },
        { session: databaseSession }
      );
    }
    for (const component of components) {
      const newComponentId = new ObjectId();
      const token = generateAutomationToken();
      await collections.components().insertOne(
        {
          ...component,
          _id: newComponentId,
          pageId: newPageId,
          groupId: component.groupId ? groupIdMap.get(component.groupId.toHexString()) ?? null : null,
          status: "OPERATIONAL",
          manualStatus: "OPERATIONAL",
          automationTokenHash: token.hash,
          automationTokenPrefix: token.prefix,
          automationTokenLastFour: token.lastFour,
          createdAt: now,
        },
        { session: databaseSession }
      );
      await collections.componentStatusEvents().insertOne(
        {
          _id: new ObjectId(),
          componentId: newComponentId,
          status: "OPERATIONAL",
          startedAt: now,
          endedAt: null,
          isMaintenance: false,
        },
        { session: databaseSession }
      );
    }
    await collections.auditLogs().insertOne(
      {
        _id: new ObjectId(),
        orgId: page.orgId,
        actor: session.email,
        action: "DUPLICATE_PAGE",
        target: newPageId.toHexString(),
        metadata: { sourcePageId: pageId },
        supportSessionId: session.supportSessionId ? oid(session.supportSessionId) : null,
        createdAt: now,
      },
      { session: databaseSession }
    );
  });
  revalidatePath("/organization/pages");
  return { ok: true, pageId: newPageId.toHexString() };
}

export type DesignActionInput = StatusPageDesign;
