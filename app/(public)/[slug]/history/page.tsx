import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { checkPageAccess } from "@/lib/access";
import { getIncidentsForPage } from "@/lib/public-data";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { IncidentCard } from "@/components/public/IncidentTimeline";

export default async function HistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pageDoc = await collections.pages().findOne({ slug });
  if (!pageDoc) notFound();
  const page = toId(pageDoc);

  const access = await checkPageAccess(page);
  if (!access.ok) redirect(`/${slug}/access`);

  const incidents = await getIncidentsForPage(page.id);

  const byMonth = new Map<string, typeof incidents>();
  for (const inc of incidents) {
    const key = new Date(inc.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(inc);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader name={page.name} logoUrl={page.logoUrl} supportUrl={page.supportUrl} />
      <main className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
        <Link href={`/${page.slug}`} className="text-sm text-blue-600 underline">
          ← Back to {page.name}
        </Link>
        <h1 className="text-xl font-semibold mt-4 mb-6">Incident History</h1>
        {[...byMonth.entries()].map(([month, incs]) => (
          <div key={month} className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">{month}</h2>
            <div className="space-y-3">
              {incs.map((inc) => (
                <IncidentCard key={inc.id} incident={inc} pageSlug={page.slug} />
              ))}
            </div>
          </div>
        ))}
        {incidents.length === 0 && <p className="text-sm text-gray-400">No incidents reported yet.</p>}
      </main>
      <PublicFooter removeBranding={page.removeBranding} />
    </div>
  );
}
