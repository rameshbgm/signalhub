import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { IncidentCard } from "@/components/public/IncidentTimeline";
import { isIncidentVisibleToScope } from "@/lib/public-data";
import { isValidOid } from "@/lib/mongo-utils";
import { publicBasePath } from "@/lib/public-path";
import type { CSSProperties } from "react";
import { PublicAnalytics } from "@/components/public/PublicAnalytics";
import { formatPageDate } from "@/lib/page-locale";

export default async function IncidentPermalinkPage({ params }: { params: Promise<{ slug: string; incidentId: string }> }) {
  const { slug, incidentId } = await params;
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);
  const basePath = await publicBasePath(page);

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

  return (
    <div
      className="status-theme min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]"
      data-theme-preset={page.themePreset ?? "SIGNAL"}
      data-theme-mode={page.themeMode ?? "SYSTEM"}
      lang={page.language}
      style={{ "--page-brand": page.brandColor } as CSSProperties}
    >
      {page.analyticsEnabled && <PublicAnalytics pageSlug={page.slug} event="INCIDENT_VIEW" />}
      <PublicHeader
        name={page.name}
        logoUrl={page.logoUrl}
        supportUrl={page.supportUrl}
        layout={page.layout}
        coverImageUrl={page.coverImageUrl}
        brandColor={page.brandColor}
        allowThemeOverride={page.allowThemeOverride ?? true}
        themeMode={page.themeMode ?? "SYSTEM"}
      />
      <main className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
        <Link href={basePath || "/"} className="text-sm text-[var(--cyan)] underline">
          ← Back to {page.name}
        </Link>
        <div className="mt-4">
          <IncidentCard
            incident={incident}
            pageSlug={basePath ? page.slug : ""}
            linkPermalink={false}
            locale={page.language}
            timeZone={page.timezone}
          />
        </div>
        {incident.postmortemPublishedAt && incident.postmortemBody && (
          <div className="mt-6 bg-[var(--surface)] border border-[var(--line)] rounded-none p-5">
            <h2 className="font-mono font-semibold mb-2 text-[var(--fg)]">Postmortem</h2>
            <p className="text-xs font-mono text-[var(--fg-dim)] mb-3">
              Published{" "}
              {formatPageDate(incident.postmortemPublishedAt, {
                language: page.language,
                timeZone: page.timezone,
                dateStyle: "long",
              })}
            </p>
            <div className="text-sm whitespace-pre-wrap text-[var(--fg-soft)]">{incident.postmortemBody}</div>
          </div>
        )}
      </main>
      <PublicFooter removeBranding={page.removeBranding} />
    </div>
  );
}
