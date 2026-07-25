import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { getIncidentsForPage } from "@/lib/public-data";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { IncidentCard } from "@/components/public/IncidentTimeline";
import { publicBasePath } from "@/lib/public-path";
import type { CSSProperties } from "react";
import { formatPageDate } from "@/lib/page-locale";

export default async function HistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);
  const basePath = await publicBasePath(page);

  const access = await checkPageAccess(page);
  if (!access.ok) {
    if (access.reason === "unavailable") notFound();
    redirect(`${basePath}/access`);
  }

  const incidents = await getIncidentsForPage(page.id, access.visibleComponentIds);
  const incidentPageSlug = basePath ? page.slug : "";

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

  return (
    <div
      className="status-theme min-h-screen flex flex-col bg-[var(--bg)] text-[var(--fg)]"
      data-theme-preset={page.themePreset ?? "SIGNAL"}
      data-theme-mode={page.themeMode ?? "SYSTEM"}
      lang={page.language}
      style={{ "--page-brand": page.brandColor } as CSSProperties}
    >
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
        <h1 className="text-xl font-mono font-semibold mt-4 mb-6 text-[var(--fg)]">Incident History</h1>
        {[...byMonth.entries()].map(([month, incs]) => (
          <div key={month} className="mb-8">
            <h2 className="text-sm font-mono font-semibold text-[var(--fg-soft)] mb-3">{month}</h2>
            <div className="space-y-3">
              {incs.map((inc) => (
                <IncidentCard
                  key={inc.id}
                  incident={inc}
                  pageSlug={incidentPageSlug}
                  locale={page.language}
                  timeZone={page.timezone}
                />
              ))}
            </div>
          </div>
        ))}
        {incidents.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No incidents reported yet.</p>}
      </main>
      <PublicFooter removeBranding={page.removeBranding} />
    </div>
  );
}
