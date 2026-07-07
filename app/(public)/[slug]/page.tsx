import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { checkPageAccess } from "@/lib/access";
import { getComponentsForPage, getIncidentsForPage, splitActiveAndPast } from "@/lib/public-data";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { StatusBanner } from "@/components/public/StatusBanner";
import { ComponentList } from "@/components/public/ComponentList";
import { SubscribeModal } from "@/components/public/SubscribeModal";
import { IncidentCard, PastIncidentsByDay } from "@/components/public/IncidentTimeline";
import { MetricChart } from "@/components/public/MetricChart";
import { syncAutoMaintenance } from "@/lib/maintenance-sync";
import Link from "next/link";

export default async function PublicStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await syncAutoMaintenance();
  const page = await prisma.page.findUnique({ where: { slug }, include: { hubParent: true } });
  if (!page) notFound();

  const access = await checkPageAccess(page);
  if (!access.ok) redirect(`/${slug}/access`);

  const { groups, ungrouped, banner } = await getComponentsForPage(page.id, access.visibleComponentIds);
  const visibleIds = access.visibleComponentIds ?? undefined;
  const incidents = await getIncidentsForPage(page.id, visibleIds ? visibleIds : null);
  const { active, past } = splitActiveAndPast(incidents);
  const activeIncidents = active.filter((i) => !i.isMaintenance);
  const activeMaintenance = active.filter((i) => i.isMaintenance);
  const upcomingMaintenance = incidents.filter((i) => i.isMaintenance && i.maintenanceStatus === "SCHEDULED");

  const metrics = await prisma.metric.findMany({
    where: { pageId: page.id, visible: true },
    include: { points: { orderBy: { timestamp: "asc" }, take: 200 } },
  });

  const allComponentsFlat = [...groups.flatMap((g) => g.components), ...ungrouped];

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader name={page.name} logoUrl={page.logoUrl} supportUrl={page.supportUrl} hubSlug={page.hubParent?.slug ?? (page.isHub ? page.slug : null)} />
      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full">
        {page.aboutText && <p className="text-sm text-gray-500 mb-4">{page.aboutText}</p>}

        <StatusBanner label={banner.label} color={banner.color} />

        <div className="mt-4 flex justify-end">
          <SubscribeModal pageSlug={page.slug} brandColor={page.brandColor} components={allComponentsFlat.map((c) => ({ id: c.id, name: c.name }))} />
        </div>

        {(activeIncidents.length > 0 || activeMaintenance.length > 0) && (
          <section className="mt-6 space-y-3">
            {activeIncidents.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} pageSlug={page.slug} />
            ))}
            {activeMaintenance.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} pageSlug={page.slug} />
            ))}
          </section>
        )}

        <section className="mt-6">
          <ComponentList groups={groups} ungrouped={ungrouped} />
        </section>

        {metrics.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-3">System Metrics</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {metrics.map((m) => (
                <MetricChart
                  key={m.id}
                  name={m.name}
                  suffix={m.suffix}
                  color={page.brandColor}
                  points={m.points.map((p) => ({ timestamp: p.timestamp.toISOString(), value: p.value }))}
                />
              ))}
            </div>
          </section>
        )}

        {upcomingMaintenance.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Scheduled Maintenance</h2>
            <div className="space-y-3">
              {upcomingMaintenance.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} pageSlug={page.slug} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Past Incidents</h2>
            <Link href={`/${page.slug}/history`} className="text-sm text-blue-600 underline">
              Incident History
            </Link>
          </div>
          <PastIncidentsByDay incidents={past} pageSlug={page.slug} days={14} />
        </section>
      </main>
      <PublicFooter removeBranding={page.removeBranding} />
    </div>
  );
}
