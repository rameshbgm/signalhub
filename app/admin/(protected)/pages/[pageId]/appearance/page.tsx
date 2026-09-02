import { notFound } from "next/navigation";
import { database } from "@/lib/postgres/client";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { PAGE_DESIGN_VERSION_HISTORY_LIMIT, designWithPagePresentation, pageDesignFor, statusPageDesignSchema } from "@/lib/page-design";
import { DesignEditor } from "@/components/admin/DesignEditor";

export default async function PageAppearance({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const pageDoc = await database.selectFrom("pages").selectAll().where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null).executeTakeFirst();
  if (!pageDoc) notFound();
  const publishedDesign = pageDesignFor(pageDoc);
  const [draft, versions, groupDocs, componentDocs] = await Promise.all([
    database.selectFrom("pageDesignDrafts").selectAll().where("pageId", "=", pageDoc.id).executeTakeFirst(),
    database.selectFrom("pageDesignVersions").selectAll().where("pageId", "=", pageDoc.id).orderBy("publishedAt", "desc").orderBy("id", "desc").limit(PAGE_DESIGN_VERSION_HISTORY_LIMIT).execute(),
    database.selectFrom("componentGroups").selectAll().where("pageId", "=", pageDoc.id).orderBy("order", "asc").execute(),
    database.selectFrom("components").selectAll().where("pageId", "=", pageDoc.id).orderBy("order", "asc").execute(),
  ]);
  const initialDesign = draft ? (draft.design && typeof draft.design === "object" && "presentation" in draft.design ? statusPageDesignSchema.parse(draft.design) : designWithPagePresentation(statusPageDesignSchema.parse(draft.design), pageDoc)) : publishedDesign;
  return <DesignEditor page={{ id: pageId, name: pageDoc.name, headline: pageDoc.headline, aboutText: pageDoc.aboutText, logoUrl: pageDoc.logoUrl, faviconUrl: pageDoc.faviconUrl, coverImageUrl: pageDoc.coverImageUrl, coverImageFit: pageDoc.coverImageFit, coverImagePositionX: pageDoc.coverImagePositionX, coverImagePositionY: pageDoc.coverImagePositionY, coverImageCropX: pageDoc.coverImageCropX, coverImageCropY: pageDoc.coverImageCropY, coverImageCropWidth: pageDoc.coverImageCropWidth, coverImageCropHeight: pageDoc.coverImageCropHeight, supportUrl: pageDoc.supportUrl, termsUrl: pageDoc.termsUrl, privacyUrl: pageDoc.privacyUrl, publicPath: pageDoc.isHub ? `/hub/${pageDoc.slug}` : `/${pageDoc.slug}`, isHub: pageDoc.isHub, publicAvailable: pageDoc.setupCompletedAt !== null && pageDoc.publicVisible !== false, legacyCssActive: Boolean(pageDoc.customCss) }} initialDesign={initialDesign} initialPublishedDesign={publishedDesign} initialRevision={draft?.revision ?? 0} publishedVersion={pageDoc.publishedDesignVersion ?? 1} versions={versions.map((version) => { const parsedDesign = statusPageDesignSchema.parse(version.design); const design = version.design && typeof version.design === "object" && "presentation" in version.design ? parsedDesign : designWithPagePresentation(parsedDesign, pageDoc); return { version: version.version, templateKey: design.templateKey, savedAt: version.publishedAt.toISOString(), design }; })} groups={groupDocs.map((group) => ({ ...group, components: componentDocs.filter((component) => component.groupId === group.id).map((component) => ({ id: component.id, name: component.name })) }))} ungrouped={componentDocs.filter((component) => !component.groupId).map((component) => ({ id: component.id, name: component.name }))} />;
}
