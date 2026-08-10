import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { checkPageAccess } from "@/lib/access";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { IncidentCard } from "@/components/public/IncidentTimeline";
import { isIncidentVisibleToScope } from "@/lib/public-data";
import { isDatabaseId } from "@/lib/database-id";
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
import { database } from "@/lib/postgres/client";
import { getActivePageAnnouncements, getPublicPageBySlug } from "@/lib/pages";

export default async function IncidentPermalinkPage({ params }: { params: Promise<{ slug: string; incidentId: string }> }) {
  const { slug, incidentId } = await params;
  const pageDoc = await getPublicPageBySlug(slug);
  if (!pageDoc) notFound();
  const page = pageDoc!;
  const design = pageDesignFor(page);
  const basePath = publicPagePath(page);

  const access = await checkPageAccess(page);
  if (!access.ok) {
    if (access.reason === "unavailable") notFound();
    redirect(`${basePath}/access`);
  }

  if (!isDatabaseId(incidentId)) notFound();
  if (!(await isIncidentVisibleToScope(incidentId, page.id, access.visibleComponentIds))) notFound();
  const incidentDoc = await database
    .selectFrom("incidents")
    .selectAll()
    .where("id", "=", incidentId)
    .where("pageId", "=", page.id)
    .executeTakeFirst();
  if (!incidentDoc) notFound();

  const [updateDocs, linkDocs] = await Promise.all([
    database.selectFrom("incidentUpdates").selectAll().where("incidentId", "=", incidentDoc.id).orderBy("createdAt", "asc").execute(),
    database.selectFrom("incidentComponents").selectAll().where("incidentId", "=", incidentDoc.id).execute(),
  ]);
  const visibleComponentIds = access.visibleComponentIds;
  const scopedLinks = visibleComponentIds === null
    ? linkDocs
    : linkDocs.filter((link) => visibleComponentIds.includes(link.componentId));
  const componentDocs = scopedLinks.length
    ? await database.selectFrom("components").selectAll().where("id", "in", scopedLinks.map((link) => link.componentId)).where("pageId", "=", page.id).execute()
    : [];
  const componentById = new Map(componentDocs.map((component) => [component.id, component]));
  const incident = {
    ...incidentDoc,
    updates: updateDocs,
    components: scopedLinks.flatMap((link) => {
      const component = componentById.get(link.componentId);
      return component ? [{ ...link, component }] : [];
    }),
  };
  const announcementDocs = await getActivePageAnnouncements(page.id, "INCIDENT");

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
      return <AnnouncementList pageId={page.id} maxItems={block.settings.maxItems} announcements={announcementDocs.map((announcement) => ({ id: announcement.id, title: announcement.title, body: announcement.body, severity: announcement.severity, ctaLabel: announcement.ctaLabel, ctaUrl: announcement.ctaUrl, dismissible: announcement.dismissible }))} />;
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
