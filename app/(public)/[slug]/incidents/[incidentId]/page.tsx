import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { IncidentCard } from "@/components/public/IncidentTimeline";

export default async function IncidentPermalinkPage({ params }: { params: Promise<{ slug: string; incidentId: string }> }) {
  const { slug, incidentId } = await params;
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);

  const access = await checkPageAccess(page);
  if (!access.ok) redirect(`/${slug}/access`);

  const incidentDoc = await collections.incidents().findOne({ _id: oid(incidentId) });
  if (!incidentDoc || incidentDoc.pageId.toHexString() !== page.id) notFound();

  const [updateDocs, linkDocs] = await Promise.all([
    collections.incidentUpdates().find({ incidentId: incidentDoc._id }).sort({ createdAt: 1 }).toArray(),
    collections.incidentComponents().find({ incidentId: incidentDoc._id }).toArray(),
  ]);
  const componentDocs = linkDocs.length
    ? await collections.components().find({ _id: { $in: linkDocs.map((l) => l.componentId) } }).toArray()
    : [];
  const componentById = new Map(componentDocs.map((c) => [c._id.toHexString(), toId(c)]));
  const incident = {
    ...toId(incidentDoc),
    updates: updateDocs.map(toId),
    components: linkDocs.map((l) => ({ ...toId(l), component: componentById.get(l.componentId.toHexString())! })),
  };

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader name={page.name} logoUrl={page.logoUrl} supportUrl={page.supportUrl} />
      <main className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
        <Link href={`/${page.slug}`} className="text-sm text-blue-600 underline">
          ← Back to {page.name}
        </Link>
        <div className="mt-4">
          <IncidentCard incident={incident} pageSlug={page.slug} linkPermalink={false} />
        </div>
        {incident.postmortemPublishedAt && incident.postmortemBody && (
          <div className="mt-6 bg-white border rounded-lg p-5">
            <h2 className="font-semibold mb-2">Postmortem</h2>
            <p className="text-xs text-gray-400 mb-3">Published {new Date(incident.postmortemPublishedAt).toLocaleDateString()}</p>
            <div className="text-sm whitespace-pre-wrap text-gray-700">{incident.postmortemBody}</div>
          </div>
        )}
      </main>
      <PublicFooter removeBranding={page.removeBranding} />
    </div>
  );
}
