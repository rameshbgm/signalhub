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
import { publicBasePath } from "@/lib/public-path";
import type { CSSProperties } from "react";
import { PublicAnalytics } from "@/components/public/PublicAnalytics";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await collections.pages().findOne({ slug });
  if (!page) return {};
  return {
    title: `${page.name} — ${page.headline || "Service status"}`,
    description: page.aboutText || `Current availability and incident history for ${page.name}.`,
    icons: page.faviconUrl ? { icon: page.faviconUrl } : undefined,
    robots: page.type === "PUBLIC" ? undefined : { index: false, follow: false },
  };
}

export default async function PublicStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) notFound();
  const hubParentDoc = pageDoc.hubParentId ? await collections.pages().findOne({ _id: pageDoc.hubParentId }) : null;
  const page = { ...toId(pageDoc), hubParent: hubParentDoc ? toId(hubParentDoc) : null };
  const basePath = await publicBasePath(page);

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

  return (
    <div
      className="status-theme min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]"
      data-status-page={page.id}
      data-theme-preset={page.themePreset ?? "SIGNAL"}
      data-theme-mode={page.themeMode ?? "SYSTEM"}
      lang={page.language}
      style={{ "--page-brand": page.brandColor } as CSSProperties}
    >
      {scopedCss && <style>{scopedCss}</style>}
      {page.analyticsEnabled && <PublicAnalytics pageSlug={page.slug} />}
      <PublicHeader
        name={page.name}
        logoUrl={page.logoUrl}
        supportUrl={page.supportUrl}
        hubSlug={page.hubParent?.slug ?? (page.isHub ? page.slug : null)}
        layout={page.layout}
        coverImageUrl={page.coverImageUrl}
        brandColor={page.brandColor}
        allowThemeOverride={page.allowThemeOverride ?? true}
        themeMode={page.themeMode ?? "SYSTEM"}
      />
      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-12 flex-1 w-full">
        <section className="mb-6">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--fg-dim)]">Live service health</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fg)] sm:text-3xl">{page.headline || "Service Status"}</h1>
              {page.aboutText && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--fg-soft)]">{page.aboutText}</p>}
            </div>
          <SubscribeModal
            pageSlug={page.slug}
            brandColor={page.brandColor}
            feedsEnabled={page.type === "PUBLIC"}
            feedBasePath={basePath ? undefined : "/feed"}
            components={allComponentsFlat.map((c) => ({ id: c.id, name: c.name }))}
          />
          </div>
          <StatusBanner
            label={banner.label}
            color={banner.color}
            updatedAt={lastActivity}
            locale={page.language}
            timeZone={page.timezone}
          />
        </section>

        {(activeIncidents.length > 0 || activeMaintenance.length > 0) && (
          <section className="mt-6 space-y-3">
            {activeIncidents.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} pageSlug={incidentPageSlug} locale={page.language} timeZone={page.timezone} />
            ))}
            {activeMaintenance.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} pageSlug={incidentPageSlug} locale={page.language} timeZone={page.timezone} />
            ))}
          </section>
        )}

        <section className="mt-6">
          <ComponentList groups={groups} ungrouped={ungrouped} />
        </section>

        {metrics.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-mono font-semibold mb-3 text-[var(--fg)]">System Metrics</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {metrics.map((m) => (
                <MetricChart
                  key={m.id}
                  name={m.name}
                  suffix={m.suffix}
                  decimals={m.decimals ?? 0}
                  locale={page.language}
                  timeZone={page.timezone}
                  color={page.brandColor}
                  points={m.points.map((p) => ({ timestamp: p.timestamp.toISOString(), value: p.value }))}
                />
              ))}
            </div>
          </section>
        )}

        {upcomingMaintenance.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-mono font-semibold mb-3 text-[var(--fg)]">Scheduled Maintenance</h2>
            <div className="space-y-3">
              {upcomingMaintenance.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} pageSlug={incidentPageSlug} locale={page.language} timeZone={page.timezone} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-mono font-semibold text-[var(--fg)]">Past Incidents</h2>
            <Link href={`${basePath}/history`} className="text-sm text-[var(--cyan)] underline">
              Incident History
            </Link>
          </div>
          <PastIncidentsByDay incidents={past} pageSlug={incidentPageSlug} days={14} locale={page.language} timeZone={page.timezone} />
        </section>
      </main>
      <PublicFooter removeBranding={page.removeBranding} termsUrl={page.termsUrl} privacyUrl={page.privacyUrl} />
    </div>
  );
}
