import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { IncidentCard } from "@/components/public/IncidentTimeline";
import { isIncidentVisibleToScope } from "@/lib/public-data";
import { isValidOid } from "@/lib/mongo-utils";
import { publicPagePath } from "@/lib/public-path";
import { PublicAnalytics } from "@/components/public/PublicAnalytics";
import { formatPageDate } from "@/lib/page-locale";
import { pageDesignFor } from "@/lib/page-design";
import { PageDesignShell } from "@/components/public/PageDesignShell";
import { scopeCustomCss } from "@/lib/custom-css";
import { PageSurfaceLayout } from "@/components/public/PageSurfaceLayout";
import type { PageDesignBlock } from "@/lib/page-design";
import { AnnouncementList } from "@/components/public/AnnouncementList";
import { SubscribeModal } from "@/components/public/SubscribeModal";
import { publicPageFilter } from "@/lib/page-lifecycle";

export default async function IncidentPermalinkPage({ params }: { params: Promise<{ slug: string; incidentId: string }> }) {
  const { slug, incidentId } = await params;
  const pageDoc = await collections.pages().findOne(publicPageFilter({ slug }));
  if (!pageDoc) notFound();
  const page = toId(pageDoc);
  const design = pageDesignFor(pageDoc);
  const basePath = publicPagePath(page);

  const access = await checkPageAccess(page);
  if (!access.ok) {
    if (access.reason === "unavailable") notFound();
    redirect(`${basePath}/access`);
  }

  if (!isValidOid(incidentId)) notFound();
  if (!(await isIncidentVisibleToScope(incidentId, page.id, access.visibleComponentIds))) notFound();
  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc || incidentDoc.pageId.toHexString() !== page.id) notFound();

  const [updateDocs, linkDocs] = await Promise.all([
    collections.incidentUpdates().find({ incidentId: incidentDoc._id }).sort({ createdAt: 1 }).toArray(),
    collections.incidentComponents().find({ incidentId: incidentDoc._id }).toArray(),
  ]);
  const visibleComponentIds = access.visibleComponentIds;
  const scopedLinks = visibleComponentIds === null
    ? linkDocs
    : linkDocs.filter((link) => visibleComponentIds.includes(link.componentId.toHexString()));
  const componentDocs = scopedLinks.length
    ? await collections.components().find({ _id: { $in: scopedLinks.map((l) => l.componentId) }, pageId: pageDoc._id }).toArray()
    : [];
  const componentById = new Map(componentDocs.map((c) => [c._id.toHexString(), toId(c)]));
  const incident = {
    ...toId(incidentDoc),
    updates: updateDocs.map(toId),
    components: scopedLinks.map((l) => ({ ...toId(l), component: componentById.get(l.componentId.toHexString())! })),
  };
  const now = new Date();
  const announcementDocs = await collections.pageAnnouncements().find({
    pageId: pageDoc._id,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    surfaces: "INCIDENT",
  }).sort({ priority: -1, startsAt: -1 }).toArray();

  function renderBlock(block: PageDesignBlock) {
    if (block.type === "INCIDENT_DETAIL") {
      return (
        <div>
          <IncidentCard incident={incident} pageSlug={basePath ? page.slug : ""} linkPermalink={false} locale={page.language} timeZone={page.timezone} />
          {block.settings.showPostmortem && incident.postmortemPublishedAt && incident.postmortemBody && (
            <div className="page-panel mt-6 border border-[var(--line)] bg-[var(--surface)] p-5">
              <h2 className="font-semibold">Postmortem</h2>
              <p className="mb-3 mt-1 text-xs text-[var(--fg-dim)]">Published {formatPageDate(incident.postmortemPublishedAt, { language: page.language, timeZone: page.timezone, dateStyle: "long" })}</p>
              <div className="whitespace-pre-wrap text-sm text-[var(--fg-soft)]">{incident.postmortemBody}</div>
            </div>
          )}
        </div>
      );
    }
    if (block.type === "ANNOUNCEMENTS") {
      return <AnnouncementList pageId={page.id} maxItems={block.settings.maxItems} announcements={announcementDocs.map((announcement) => ({ id: announcement._id.toHexString(), title: announcement.title, body: announcement.body, severity: announcement.severity, ctaLabel: announcement.ctaLabel, ctaUrl: announcement.ctaUrl, dismissible: announcement.dismissible }))} />;
    }
    if (block.type === "RICH_TEXT") return <article className="page-panel border border-[var(--line)] bg-[var(--surface)] p-[var(--page-block-padding)]">{block.settings.heading && <h2 className="font-semibold">{block.settings.heading}</h2>}<p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fg-soft)]">{block.settings.body}</p></article>;
    if (block.type === "SUBSCRIBE") return <SubscribeModal pageSlug={page.slug} brandColor={design.theme.palette.brand} feedsEnabled={page.type === "PUBLIC"} components={[]} />;
    if (block.type === "LINK_CARDS") return <div className="grid gap-3 sm:grid-cols-2">{block.settings.links.map((link) => <a key={link.url} href={link.url} className="page-panel border border-[var(--line)] bg-[var(--surface)] p-4"><strong>{link.label}</strong><p className="text-sm text-[var(--fg-soft)]">{link.description}</p></a>)}</div>;
    return null;
  }

  return (
    <PageDesignShell pageId={page.id} publishedVersion={page.publishedDesignVersion} design={design} customCss={scopeCustomCss(page.customCss, page.id)} language={page.language}>
      {page.analyticsEnabled && <PublicAnalytics pageSlug={page.slug} event="INCIDENT_VIEW" />}
      <PublicHeader
        name={page.name}
        logoUrl={page.logoUrl}
        supportUrl={page.supportUrl}
        layout={page.layout}
        coverImageUrl={page.coverImageUrl}
        coverImageFit={page.coverImageFit}
        coverImagePositionX={page.coverImagePositionX}
        coverImagePositionY={page.coverImagePositionY}
        coverImageCropX={page.coverImageCropX}
        coverImageCropY={page.coverImageCropY}
        coverImageCropWidth={page.coverImageCropWidth}
        coverImageCropHeight={page.coverImageCropHeight}
        brandColor={page.brandColor}
        allowThemeOverride={page.allowThemeOverride ?? true}
        themeMode={page.themeMode ?? "SYSTEM"}
        design={design}
        subscribeSlot={<SubscribeModal pageSlug={page.slug} brandColor={design.theme.palette.brand} feedsEnabled={page.type === "PUBLIC"} components={[]} />}
      />
      <PageSurfaceLayout
        design={design}
        surface="incident"
        intro={<div className="mb-6"><Link href={basePath || "/"} className="text-sm underline" style={{ color: "var(--page-brand)" }}>← Back to {page.name}</Link></div>}
        renderBlock={renderBlock}
      />
      <PublicFooter removeBranding={page.removeBranding} design={design} termsUrl={page.termsUrl} privacyUrl={page.privacyUrl} supportUrl={page.supportUrl} />
    </PageDesignShell>
  );
}
