import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { checkPageAccess } from "@/lib/access";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { IncidentCard } from "@/components/public/IncidentTimeline";

export default async function IncidentPermalinkPage({ params }: { params: Promise<{ slug: string; incidentId: string }> }) {
  const { slug, incidentId } = await params;
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) notFound();

  const access = await checkPageAccess(page);
  if (!access.ok) redirect(`/${slug}/access`);

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { updates: { orderBy: { createdAt: "asc" } }, components: { include: { component: true } } },
  });
  if (!incident || incident.pageId !== page.id) notFound();

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
