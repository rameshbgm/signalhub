import { notFound } from "next/navigation";
import { collections } from "@/lib/db";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { oid, toId } from "@/lib/mongo-utils";
import { PAGE_DESIGN_VERSION_HISTORY_LIMIT, pageDesignFor, statusPageDesignSchema } from "@/lib/page-design";
import { DesignEditor } from "@/components/admin/DesignEditor";

export default async function PageDesignBuilder({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const pageDoc = await collections.pages().findOne({
    _id: oid(pageId),
    orgId: oid(session.orgId),
  });
  if (!pageDoc) notFound();
  const [draft, versions, announcements, groupDocs, componentDocs] = await Promise.all([
    collections.pageDesignDrafts().findOne({ pageId: pageDoc._id }),
    collections.pageDesignVersions().find({ pageId: pageDoc._id }).sort({ publishedAt: -1, _id: -1 }).limit(PAGE_DESIGN_VERSION_HISTORY_LIMIT).toArray(),
    collections.pageAnnouncements().find({ pageId: pageDoc._id }).sort({ startsAt: -1 }).toArray(),
    collections.componentGroups().find({ pageId: pageDoc._id }).sort({ order: 1 }).toArray(),
    collections.components().find({ pageId: pageDoc._id }).sort({ order: 1 }).toArray(),
  ]);

  return (
    <DesignEditor
      page={{
        id: pageId,
        name: pageDoc.name,
        headline: pageDoc.headline,
        aboutText: pageDoc.aboutText,
        logoUrl: pageDoc.logoUrl,
        faviconUrl: pageDoc.faviconUrl,
        coverImageUrl: pageDoc.coverImageUrl,
        coverImageFit: pageDoc.coverImageFit,
        coverImagePositionX: pageDoc.coverImagePositionX,
        coverImagePositionY: pageDoc.coverImagePositionY,
        coverImageCropX: pageDoc.coverImageCropX,
        coverImageCropY: pageDoc.coverImageCropY,
        coverImageCropWidth: pageDoc.coverImageCropWidth,
        coverImageCropHeight: pageDoc.coverImageCropHeight,
        supportUrl: pageDoc.supportUrl,
        publicPath: pageDoc.isHub ? `/hub/${pageDoc.slug}` : `/${pageDoc.slug}`,
        legacyCssActive: Boolean(pageDoc.customCss),
      }}
      initialDesign={draft ? statusPageDesignSchema.parse(draft.design) : pageDesignFor(pageDoc)}
      initialRevision={draft?.revision ?? 0}
      publishedVersion={pageDoc.publishedDesignVersion ?? 1}
      versions={versions.map((version) => ({
        version: version.version,
        templateKey: version.design.templateKey,
        savedAt: version.publishedAt.toISOString(),
        design: statusPageDesignSchema.parse(version.design),
      }))}
      announcements={announcements.map((announcement) => ({
        id: announcement._id.toHexString(),
        title: announcement.title,
        body: announcement.body,
        severity: announcement.severity,
        ctaLabel: announcement.ctaLabel,
        ctaUrl: announcement.ctaUrl,
        startsAt: announcement.startsAt.toISOString(),
        endsAt: announcement.endsAt?.toISOString() ?? null,
        dismissible: announcement.dismissible,
        priority: announcement.priority,
      }))}
      groups={groupDocs.map((group) => ({
        ...toId(group),
        components: componentDocs
          .filter((component) => component.groupId?.equals(group._id))
          .map((component) => ({ id: component._id.toHexString(), name: component.name })),
      }))}
      ungrouped={componentDocs
        .filter((component) => !component.groupId)
        .map((component) => ({ id: component._id.toHexString(), name: component.name }))}
    />
  );
}
