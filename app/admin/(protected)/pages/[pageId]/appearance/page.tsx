import { notFound } from "next/navigation";
import { database } from "@/lib/postgres/client";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { designWithPagePresentation, pageDesignFor, statusPageDesignSchema } from "@/lib/page-design";
import { SimpleAppearanceEditor } from "@/components/admin/SimpleAppearanceEditor";

export default async function PageAppearance({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const pageDoc = await database.selectFrom("pages").selectAll().where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null).executeTakeFirst();
  if (!pageDoc) notFound();
  const publishedDesign = pageDesignFor(pageDoc);
  const draft = await database.selectFrom("pageDesignDrafts").selectAll().where("pageId", "=", pageDoc.id).executeTakeFirst();
  const initialDesign = draft ? (draft.design && typeof draft.design === "object" && "presentation" in draft.design ? statusPageDesignSchema.parse(draft.design) : designWithPagePresentation(statusPageDesignSchema.parse(draft.design), pageDoc)) : publishedDesign;
  return <SimpleAppearanceEditor page={{ id: pageId, name: pageDoc.name, logoUrl: pageDoc.logoUrl, faviconUrl: pageDoc.faviconUrl, coverImageUrl: pageDoc.coverImageUrl, coverImageFit: pageDoc.coverImageFit, coverImagePositionX: pageDoc.coverImagePositionX, coverImagePositionY: pageDoc.coverImagePositionY, coverImageCropX: pageDoc.coverImageCropX, coverImageCropY: pageDoc.coverImageCropY, coverImageCropWidth: pageDoc.coverImageCropWidth, coverImageCropHeight: pageDoc.coverImageCropHeight, publicPath: pageDoc.isHub ? `/hub/${pageDoc.slug}` : `/${pageDoc.slug}`, publicAvailable: pageDoc.setupCompletedAt !== null && pageDoc.publicVisible !== false }} initialDesign={initialDesign} initialPublishedDesign={publishedDesign} initialRevision={draft?.revision ?? 0} publishedVersion={pageDoc.publishedDesignVersion ?? 1} />;
}
