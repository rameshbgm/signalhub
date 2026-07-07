import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { overallBanner, COMPONENT_STATUS_COLOR, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { StatusBanner } from "@/components/public/StatusBanner";
import { SubscribeModal } from "@/components/public/SubscribeModal";
import { PastIncidentsByDay } from "@/components/public/IncidentTimeline";

export default async function HubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hub = await prisma.page.findUnique({
    where: { slug },
    include: { hubChildren: { orderBy: { createdAt: "asc" } } },
  });
  if (!hub || !hub.isHub) notFound();

  const childData = await Promise.all(
    hub.hubChildren.map(async (child) => {
      const components = await prisma.component.findMany({ where: { pageId: child.id, visible: true } });
      const banner = overallBanner(components.map((c) => c.status as ComponentStatus));
      return { child, banner, componentCount: components.length };
    })
  );

  const aggregateBanner = overallBanner(childData.map((c) => c.banner.status));

  const childIds = hub.hubChildren.map((c) => c.id);
  const incidents = await prisma.incident.findMany({
    where: { pageId: { in: childIds } },
    orderBy: { createdAt: "desc" },
    include: { updates: { orderBy: { createdAt: "asc" } }, components: { include: { component: true } } },
    take: 50,
  });
  // Tag each incident's page name onto it for display context by wrapping name.
  const incidentsWithPage = incidents.map((inc) => {
    const childPage = hub.hubChildren.find((c) => c.id === inc.pageId);
    return { ...inc, name: `[${childPage?.name ?? ""}] ${inc.name}`, linkSlug: childPage?.slug };
  });

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader name={hub.name} logoUrl={hub.logoUrl} supportUrl={hub.supportUrl} />
      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full">
        {hub.aboutText && <p className="text-sm text-gray-500 mb-4">{hub.aboutText}</p>}
        <StatusBanner label={aggregateBanner.label} color={aggregateBanner.color} />
        <div className="mt-4 flex justify-end">
          <SubscribeModal pageSlug={hub.slug} brandColor={hub.brandColor} components={[]} />
        </div>

        <section className="mt-8 grid sm:grid-cols-2 gap-4">
          {childData.map(({ child, banner, componentCount }) => (
            <Link
              key={child.id}
              href={`/${child.slug}`}
              className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{child.name}</span>
                <span className="status-dot" style={{ backgroundColor: COMPONENT_STATUS_COLOR[banner.status] }} />
              </div>
              <span className="text-sm" style={{ color: banner.color }}>
                {banner.label}
              </span>
              <span className="text-xs text-gray-400">{componentCount} components</span>
            </Link>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold mb-4">Past Incidents (All Products)</h2>
          <PastIncidentsByDay incidents={incidentsWithPage} pageSlug={hub.slug} days={15} />
        </section>
      </main>
      <PublicFooter removeBranding={hub.removeBranding} />
    </div>
  );
}
