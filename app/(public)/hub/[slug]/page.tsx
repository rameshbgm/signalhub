import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { overallBanner, COMPONENT_STATUS_COLOR } from "@/lib/status";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { StatusBanner } from "@/components/public/StatusBanner";
import { SubscribeModal } from "@/components/public/SubscribeModal";
import { IncidentCard, PastIncidentsByDay } from "@/components/public/IncidentTimeline";
import { checkPageAccess } from "@/lib/access";
import { splitActiveAndPast } from "@/lib/public-data";
import { getPublicSurfaceSummary } from "@/lib/public-surface";
import { publicPagePath } from "@/lib/public-path";
import type { CSSProperties } from "react";

export default async function HubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hubDoc = await collections.pages().findOne({ slug });
  if (!hubDoc || !hubDoc.isHub) notFound();
  const hub = toId(hubDoc);
  const hubAccess = await checkPageAccess(hub);
  if (!hubAccess.ok) {
    if (hubAccess.reason === "unavailable") notFound();
    redirect(
      `/${encodeURIComponent(slug)}/access?returnTo=${encodeURIComponent(
        publicPagePath(hub)
      )}`
    );
  }
  const candidateChildren = await collections
    .pages()
    .find({ hubParentId: hubDoc._id, orgId: hubDoc.orgId, isHub: false })
    .sort({ createdAt: 1 })
    .toArray();
  const childData = (
    await Promise.all(
      candidateChildren.map(async (childDoc) => {
        const child = toId(childDoc);
        const access = await checkPageAccess(child);
        if (!access.ok) return null;
        const summary = await getPublicSurfaceSummary(child.id, access.visibleComponentIds);
        return { child, ...summary };
      })
    )
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const visibleStatuses = childData
    .map((child) => child.banner?.status)
    .filter((status): status is NonNullable<typeof status> => Boolean(status));
  const aggregateBanner = visibleStatuses.length
    ? overallBanner(visibleStatuses)
    : { label: "No current status data", color: "#64748b" };
  const allIncidents = childData
    .flatMap(({ child, incidents }) =>
      incidents.map((incident) => ({
        ...incident,
        name: `[${child.name}] ${incident.name}`,
        linkSlug: child.slug,
      }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const { active, past } = splitActiveAndPast(allIncidents);
  const activeIncidents = active.filter((incident) => !incident.isMaintenance);
  const activeMaintenance = active.filter((incident) => incident.isMaintenance);
  const scheduledMaintenance = allIncidents.filter(
    (incident) => incident.isMaintenance && incident.maintenanceStatus === "SCHEDULED"
  );

  return (
    <div
      className="status-theme min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]"
      data-theme-preset={hub.themePreset ?? "SIGNAL"}
      data-theme-mode={hub.themeMode ?? "SYSTEM"}
      lang={hub.language}
      style={{ "--page-brand": hub.brandColor } as CSSProperties}
    >
      <PublicHeader
        name={hub.name}
        logoUrl={hub.logoUrl}
        supportUrl={hub.supportUrl}
        layout={hub.layout}
        coverImageUrl={hub.coverImageUrl}
        brandColor={hub.brandColor}
        allowThemeOverride={hub.allowThemeOverride ?? true}
        themeMode={hub.themeMode ?? "SYSTEM"}
      />
      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full">
        {hub.aboutText && <p className="text-sm text-[var(--fg-soft)] mb-4">{hub.aboutText}</p>}
        <StatusBanner
          label={aggregateBanner.label}
          color={aggregateBanner.color}
          locale={hub.language}
          timeZone={hub.timezone}
        />
        <div className="mt-4 flex justify-end">
          <SubscribeModal pageSlug={hub.slug} brandColor={hub.brandColor} feedsEnabled={hub.type === "PUBLIC"} components={[]} />
        </div>

        <section className="mt-8 grid sm:grid-cols-2 gap-4">
          {childData.map(({ child, banner, componentCount }) => (
            <Link
              key={child.id}
              href={publicPagePath(child)}
              className="border border-[var(--line)] rounded-none p-4 bg-[var(--surface)] hover:border-[var(--line-bright)] transition-colors flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--fg)]">{child.name}</span>
                <span
                  className="status-dot rounded-full"
                  style={{ backgroundColor: banner ? COMPONENT_STATUS_COLOR[banner.status] : "#64748b" }}
                />
              </div>
              <span className="text-sm font-mono" style={{ color: banner?.color ?? "#64748b" }}>
                {banner?.label ?? "No current status data"}
              </span>
              <span className="text-xs text-[var(--fg-dim)]">{componentCount} components</span>
            </Link>
          ))}
          {childData.length === 0 && (
            <p className="text-sm text-[var(--fg-dim)] sm:col-span-2">
              No products are available for your current access.
            </p>
          )}
        </section>

        {(activeIncidents.length > 0 || activeMaintenance.length > 0) && (
          <section className="mt-10">
            <h2 className="text-lg font-mono font-semibold mb-4 text-[var(--fg)]">Current Events</h2>
            <div className="space-y-3">
              {[...activeIncidents, ...activeMaintenance].map((incident) => (
                <IncidentCard key={incident.id} incident={incident} pageSlug={hub.slug} locale={hub.language} timeZone={hub.timezone} />
              ))}
            </div>
          </section>
        )}

        {scheduledMaintenance.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-mono font-semibold mb-4 text-[var(--fg)]">Scheduled Maintenance</h2>
            <div className="space-y-3">
              {scheduledMaintenance.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} pageSlug={hub.slug} locale={hub.language} timeZone={hub.timezone} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-mono font-semibold mb-4 text-[var(--fg)]">Past Incidents (All Products)</h2>
          <PastIncidentsByDay incidents={past} pageSlug={hub.slug} days={15} locale={hub.language} timeZone={hub.timezone} />
        </section>
      </main>
      <PublicFooter removeBranding={hub.removeBranding} termsUrl={hub.termsUrl} privacyUrl={hub.privacyUrl} />
    </div>
  );
}
