import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { getIncidentsForPage } from "@/lib/public-data";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { IncidentCard } from "@/components/public/IncidentTimeline";
import { publicPagePath } from "@/lib/public-path";
import { formatPageDate } from "@/lib/page-locale";
import { pageDesignFor } from "@/lib/page-design";
import { PageDesignShell } from "@/components/public/PageDesignShell";
import { scopeCustomCss } from "@/lib/custom-css";
import { PageSurfaceLayout } from "@/components/public/PageSurfaceLayout";
import type { PageDesignBlock } from "@/lib/page-design";
import { AnnouncementList } from "@/components/public/AnnouncementList";
import { SubscribeModal } from "@/components/public/SubscribeModal";

export default async function HistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);
  const design = pageDesignFor(pageDoc);
  const basePath = publicPagePath(page);

  const access = await checkPageAccess(page);
  if (!access.ok) {
    if (access.reason === "unavailable") notFound();
    redirect(`${basePath}/access`);
  }

  const incidents = await getIncidentsForPage(page.id, access.visibleComponentIds);
  const incidentPageSlug = page.slug;
  const now = new Date();
  const announcementDocs = await collections.pageAnnouncements().find({
    pageId: pageDoc._id,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    surfaces: "HISTORY",
  }).sort({ priority: -1, startsAt: -1 }).toArray();

  const byMonth = new Map<string, typeof incidents>();
  for (const inc of incidents) {
    const key = formatPageDate(inc.createdAt, {
      language: page.language,
      timeZone: page.timezone,
      month: "long",
      year: "numeric",
    });
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(inc);
  }
  function renderBlock(block: PageDesignBlock) {
    if (block.type === "HISTORY_LIST") {
      return (
        <div>
          {[...byMonth.entries()].map(([month, incs]) => (
            <div key={month} className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-[var(--fg-soft)]">{month}</h2>
              <div className="space-y-3">
                {incs.filter((incident) => block.settings.showMaintenance || !incident.isMaintenance).map((incident) => (
                  <IncidentCard key={incident.id} incident={incident} pageSlug={incidentPageSlug} locale={page.language} timeZone={page.timezone} />
                ))}
              </div>
            </div>
          ))}
          {incidents.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No incidents reported yet.</p>}
        </div>
      );
    }
    if (block.type === "ANNOUNCEMENTS") {
      return <AnnouncementList pageId={page.id} maxItems={block.settings.maxItems} announcements={announcementDocs.map((announcement) => ({ id: announcement._id.toHexString(), title: announcement.title, body: announcement.body, severity: announcement.severity, ctaLabel: announcement.ctaLabel, ctaUrl: announcement.ctaUrl, dismissible: announcement.dismissible }))} />;
    }
    if (block.type === "RICH_TEXT") {
      return <article className={`page-panel border border-[var(--line)] bg-[var(--surface)] p-[var(--page-block-padding)] ${block.settings.align === "CENTER" ? "text-center" : ""}`}>{block.settings.heading && <h2 className="text-xl font-semibold">{block.settings.heading}</h2>}<p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fg-soft)]">{block.settings.body}</p></article>;
    }
    if (block.type === "SUBSCRIBE") {
      return <SubscribeModal pageSlug={page.slug} brandColor={design.theme.palette.brand} feedsEnabled={page.type === "PUBLIC"} components={[]} />;
    }
    if (block.type === "LINK_CARDS") {
      return <div className="grid gap-3 sm:grid-cols-2">{block.settings.links.map((link) => <a key={link.url} href={link.url} className="page-panel border border-[var(--line)] bg-[var(--surface)] p-4"><strong>{link.label}</strong><p className="text-sm text-[var(--fg-soft)]">{link.description}</p></a>)}</div>;
    }
    return null;
  }

  return (
    <PageDesignShell pageId={page.id} publishedVersion={page.publishedDesignVersion} design={design} customCss={scopeCustomCss(page.customCss, page.id)} language={page.language}>
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
        surface="history"
        intro={<div className="mb-6"><Link href={basePath || "/"} className="text-sm underline" style={{ color: "var(--page-brand)" }}>← Back to {page.name}</Link><h1 className="mt-4 text-xl font-semibold">Incident history</h1></div>}
        renderBlock={renderBlock}
      />
      <PublicFooter removeBranding={page.removeBranding} design={design} termsUrl={page.termsUrl} privacyUrl={page.privacyUrl} supportUrl={page.supportUrl} />
    </PageDesignShell>
  );
}
