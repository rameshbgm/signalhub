import { notFound } from "next/navigation";
import Link from "next/link";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { overallBanner, COMPONENT_STATUS_COLOR, type ComponentStatus } from "@/lib/status";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { StatusBanner } from "@/components/public/StatusBanner";
import { SubscribeModal } from "@/components/public/SubscribeModal";
import { PastIncidentsByDay } from "@/components/public/IncidentTimeline";

export default async function HubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hubDoc = await collections.pages().findOne({ slug });
  if (!hubDoc || !hubDoc.isHub) notFound();
  const hubChildDocs = await collections.pages().find({ hubParentId: hubDoc._id }).sort({ createdAt: 1 }).toArray();
  const hub = { ...toId(hubDoc), hubChildren: hubChildDocs.map(toId) };

  const childData = await Promise.all(
    hub.hubChildren.map(async (child) => {
      const components = (await collections.components().find({ pageId: hubChildDocs.find((c) => c._id.toHexString() === child.id)!._id, visible: true }).toArray()).map(toId);
      const banner = overallBanner(components.map((c) => c.status as ComponentStatus));
      return { child, banner, componentCount: components.length };
    })
  );

  const aggregateBanner = overallBanner(childData.map((c) => c.banner.status));

  const childIds = hubChildDocs.map((c) => c._id);
  const incidentDocs = await collections
    .incidents()
    .find({ pageId: { $in: childIds } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  const incidentIds = incidentDocs.map((i) => i._id);
  const [updateDocs, linkDocs] = await Promise.all([
    incidentIds.length
      ? collections.incidentUpdates().find({ incidentId: { $in: incidentIds } }).sort({ createdAt: 1 }).toArray()
      : Promise.resolve([]),
    incidentIds.length ? collections.incidentComponents().find({ incidentId: { $in: incidentIds } }).toArray() : Promise.resolve([]),
  ]);
  const linkedComponentIdSet = new Map(linkDocs.map((l) => [l.componentId.toHexString(), l.componentId]));
  const linkedComponentIds = [...linkedComponentIdSet.values()];
  const componentDocs = linkedComponentIds.length
    ? await collections.components().find({ _id: { $in: linkedComponentIds } }).toArray()
    : [];
  const componentById = new Map(componentDocs.map((c) => [c._id.toHexString(), toId(c)]));
  const updatesByIncident = new Map<string, typeof updateDocs>();
  for (const u of updateDocs) {
    const key = u.incidentId.toHexString();
    if (!updatesByIncident.has(key)) updatesByIncident.set(key, []);
    updatesByIncident.get(key)!.push(u);
  }
  const linksByIncident = new Map<string, typeof linkDocs>();
  for (const l of linkDocs) {
    const key = l.incidentId.toHexString();
    if (!linksByIncident.has(key)) linksByIncident.set(key, []);
    linksByIncident.get(key)!.push(l);
  }

  const incidentsWithPage = incidentDocs.map((inc) => {
    const childPage = hubChildDocs.find((c) => c._id.toHexString() === inc.pageId.toHexString());
    return {
      ...toId(inc),
      updates: (updatesByIncident.get(inc._id.toHexString()) ?? []).map(toId),
      components: (linksByIncident.get(inc._id.toHexString()) ?? []).map((l) => ({
        ...toId(l),
        component: componentById.get(l.componentId.toHexString())!,
      })),
      name: `[${childPage?.name ?? ""}] ${inc.name}`,
      linkSlug: childPage?.slug,
    };
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
