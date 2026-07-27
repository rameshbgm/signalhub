import { notFound, redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { getComponentsForPage, getIncidentsForPage, getMetricsForPage, splitActiveAndPast } from "@/lib/public-data";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { StatusBanner } from "@/components/public/StatusBanner";
import { ComponentList } from "@/components/public/ComponentList";
import { SubscribeModal } from "@/components/public/SubscribeModal";
import { IncidentCard, PastIncidentsByDay } from "@/components/public/IncidentTimeline";
import { MetricChart } from "@/components/public/MetricChart";
import Link from "next/link";
import { scopeCustomCss } from "@/lib/custom-css";
import { publicPagePath } from "@/lib/public-path";
import { PublicAnalytics } from "@/components/public/PublicAnalytics";
import type { Metadata } from "next";
import { pageDesignFor, type PageDesignBlock } from "@/lib/page-design";
import { PageDesignShell, contentWidthClass } from "@/components/public/PageDesignShell";
import { AnnouncementList } from "@/components/public/AnnouncementList";
import { publicFaviconMetadata } from "@/lib/public-favicon";
import { publicPageFilter } from "@/lib/page-lifecycle";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await collections.pages().findOne(publicPageFilter({ slug }));
  if (!page) return {};
  const design = pageDesignFor(page);
  return {
    title: design.seo.title || `${page.name} — ${page.headline || "Service status"}`,
    description: design.seo.description || page.aboutText || `Current availability and incident history for ${page.name}.`,
    openGraph: design.seo.socialImageUrl ? { images: [design.seo.socialImageUrl] } : undefined,
    ...publicFaviconMetadata(page.faviconUrl),
    robots: page.type === "PUBLIC" && !design.seo.noIndex ? undefined : { index: false, follow: false },
  };
}

export default async function PublicStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageDoc = await collections.pages().findOne(publicPageFilter({ slug }));
  if (!pageDoc) notFound();
  if (pageDoc.isHub) redirect(`/hub/${encodeURIComponent(pageDoc.slug)}`);
  const hubParentDoc = pageDoc.hubParentId ? await collections.pages().findOne(publicPageFilter({ _id: pageDoc.hubParentId })) : null;
  const page = { ...toId(pageDoc), hubParent: hubParentDoc ? toId(hubParentDoc) : null };
  const design = pageDesignFor(pageDoc);
  const basePath = publicPagePath(page);

  const access = await checkPageAccess(page);
  if (!access.ok) {
    if (access.reason === "unavailable") notFound();
    redirect(`${basePath}/access`);
  }

  const { groups, ungrouped, banner } = await getComponentsForPage(page.id, access.visibleComponentIds);
  const incidents = await getIncidentsForPage(page.id, access.visibleComponentIds);
  const { active, past } = splitActiveAndPast(incidents);
  const activeIncidents = active.filter((i) => !i.isMaintenance);
  const activeMaintenance = active.filter((i) => i.isMaintenance);
  const upcomingMaintenance = incidents.filter((i) => i.isMaintenance && i.maintenanceStatus === "SCHEDULED");

  const metrics = await getMetricsForPage(page.id, access.visibleComponentIds);
  const now = new Date();
  const announcementDocs = await collections.pageAnnouncements()
    .find({
      pageId: pageDoc._id,
      startsAt: { $lte: now },
      $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
      surfaces: "STATUS",
    })
    .sort({ priority: -1, startsAt: -1 })
    .toArray();
  const announcements = announcementDocs.map((announcement) => ({
    id: announcement._id.toHexString(),
    title: announcement.title,
    body: announcement.body,
    severity: announcement.severity,
    ctaLabel: announcement.ctaLabel,
    ctaUrl: announcement.ctaUrl,
    dismissible: announcement.dismissible,
  }));
  const scopedCss = scopeCustomCss(page.customCss, page.id);
  const incidentPageSlug = basePath ? page.slug : "";

  const allComponentsFlat = [...groups.flatMap((g) => g.components), ...ungrouped];
  const activityDates = [
    ...allComponentsFlat.flatMap((component) => component.statusEvents.map((event) => new Date(event.startedAt))),
    ...incidents.flatMap((incident) => incident.updates.map((update) => new Date(update.createdAt))),
  ];
  const lastActivity = activityDates.length
    ? new Date(Math.max(...activityDates.map((date) => date.getTime())))
    : page.createdAt;

  function renderBlock(block: PageDesignBlock) {
    if (block.hidden) return null;
    switch (block.type) {
      case "OVERALL_STATUS":
        return (
          <StatusBanner
            label={banner.label}
            color={banner.color}
            updatedAt={lastActivity}
            locale={page.language}
            timeZone={page.timezone}
            variant={block.settings.style}
            showLastUpdated={block.settings.showLastUpdated}
            description={block.settings.showDescription ? page.aboutText : null}
          />
        );
      case "ANNOUNCEMENTS":
        return <AnnouncementList pageId={page.id} announcements={announcements} maxItems={block.settings.maxItems} />;
      case "RICH_TEXT":
        return (
          <article className={`page-panel border border-[var(--line)] bg-[var(--surface)] p-[var(--page-block-padding)] ${block.settings.align === "CENTER" ? "text-center" : ""}`}>
            {block.settings.heading && <h2 className="text-xl font-semibold">{block.settings.heading}</h2>}
            {block.settings.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--fg-soft)]">{block.settings.body}</p>}
          </article>
        );
      case "COMPONENT_STATUS":
        return <ComponentList groups={groups} ungrouped={ungrouped} settings={block.settings} nowIso={now.toISOString()} />;
      case "ACTIVE_INCIDENTS":
        return activeIncidents.length ? (
          <section>
            <h2 className="mb-3 text-lg font-semibold">{block.settings.heading}</h2>
            <div className="space-y-3">
              {activeIncidents.map((incident) => <IncidentCard key={incident.id} incident={incident} pageSlug={incidentPageSlug} locale={page.language} timeZone={page.timezone} />)}
            </div>
          </section>
        ) : null;
      case "SCHEDULED_MAINTENANCE":
        return upcomingMaintenance.length || activeMaintenance.length ? (
          <section>
            <h2 className="mb-3 text-lg font-semibold">{block.settings.heading}</h2>
            <div className="space-y-3">
              {[...activeMaintenance, ...upcomingMaintenance].map((incident) => <IncidentCard key={incident.id} incident={incident} pageSlug={incidentPageSlug} locale={page.language} timeZone={page.timezone} />)}
            </div>
          </section>
        ) : null;
      case "METRICS":
        return metrics.length ? (
          <section>
            <h2 className="mb-3 text-lg font-semibold">{block.settings.heading}</h2>
            <div className={`grid gap-4 ${block.settings.columns === 2 ? "sm:grid-cols-2" : ""}`}>
              {metrics.map((metric) => (
                <MetricChart
                  key={metric.id}
                  name={metric.name}
                  suffix={metric.suffix}
                  decimals={metric.decimals ?? 0}
                  locale={page.language}
                  timeZone={page.timezone}
                  color={design.theme.palette.brand}
                  points={metric.points.map((point) => ({ timestamp: point.timestamp.toISOString(), value: point.value }))}
                />
              ))}
            </div>
          </section>
        ) : null;
      case "HISTORY_PREVIEW":
        return (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{block.settings.heading}</h2>
              <Link href={`${basePath}/history`} className="text-sm underline" style={{ color: "var(--page-brand)" }}>Incident history</Link>
            </div>
            <PastIncidentsByDay incidents={past} pageSlug={incidentPageSlug} days={block.settings.days} locale={page.language} timeZone={page.timezone} />
          </section>
        );
      case "SUBSCRIBE":
        return (
          <section className={block.settings.style === "PANEL" ? "page-panel border border-[var(--line)] bg-[var(--surface)] p-[var(--page-block-padding)]" : ""}>
            {block.settings.style !== "BUTTON" && <h2 className="mb-3 font-semibold">{block.settings.heading}</h2>}
            <SubscribeModal
              pageSlug={page.slug}
              brandColor={design.theme.palette.brand}
              feedsEnabled={page.type === "PUBLIC"}
              feedBasePath={basePath ? undefined : "/feed"}
              components={allComponentsFlat.map((component) => ({ id: component.id, name: component.name }))}
            />
          </section>
        );
      case "LINK_CARDS":
        return block.settings.links.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {block.settings.links.map((link) => (
              <a key={link.url} href={link.url} className="page-panel border border-[var(--line)] bg-[var(--surface)] p-4 transition-transform hover:-translate-y-0.5">
                <strong>{link.label}</strong>
                {link.description && <p className="mt-1 text-sm text-[var(--fg-soft)]">{link.description}</p>}
              </a>
            ))}
          </div>
        ) : null;
      default:
        return null;
    }
  }

  const statusSurface = design.surfaces.status;
  return (
    <PageDesignShell pageId={page.id} publishedVersion={page.publishedDesignVersion} design={design} customCss={scopedCss} language={page.language}>
      {page.analyticsEnabled && <PublicAnalytics pageSlug={page.slug} />}
      <PublicHeader
        name={page.name}
        logoUrl={page.logoUrl}
        supportUrl={page.supportUrl}
        hubSlug={page.hubParent?.slug ?? (page.isHub ? page.slug : null)}
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
        subscribeSlot={
          <SubscribeModal
            pageSlug={page.slug}
            brandColor={design.theme.palette.brand}
            feedsEnabled={page.type === "PUBLIC"}
            feedBasePath={basePath ? undefined : "/feed"}
            components={allComponentsFlat.map((component) => ({ id: component.id, name: component.name }))}
          />
        }
      />
      <main className={`${contentWidthClass(design)} mx-auto w-full flex-1 px-4 py-8 sm:py-12`}>
        <section className="mb-8">
          <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--fg-dim)]">Live service health</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fg)] sm:text-3xl">{page.headline || "Service Status"}</h1>
              {page.aboutText && !statusSurface.full.some((block) => block.type === "OVERALL_STATUS" && !block.hidden && block.settings.showDescription) && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--fg-soft)]">{page.aboutText}</p>
              )}
          </div>
        </section>
        <div className="space-y-[var(--page-block-gap)]">
          {statusSurface.full.map((block) => <div key={block.id} data-page-block={block.type}>{renderBlock(block)}</div>)}
        </div>
        <div className={`mt-[var(--page-block-gap)] grid gap-[var(--page-block-gap)] ${statusSurface.sidebar.some((block) => !block.hidden) ? "lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]" : ""}`}>
          <div className="space-y-[var(--page-block-gap)]">
            {statusSurface.primary.map((block) => <div key={block.id} data-page-block={block.type}>{renderBlock(block)}</div>)}
          </div>
          <aside className="space-y-[var(--page-block-gap)]">
            {statusSurface.sidebar.map((block) => <div key={block.id} data-page-block={block.type}>{renderBlock(block)}</div>)}
          </aside>
          </div>
      </main>
      <PublicFooter removeBranding={page.removeBranding} termsUrl={page.termsUrl} privacyUrl={page.privacyUrl} supportUrl={page.supportUrl} design={design} />
    </PageDesignShell>
  );
}
