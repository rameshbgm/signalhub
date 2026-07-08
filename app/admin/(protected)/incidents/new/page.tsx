import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { createIncident } from "../actions";
import { IncidentForm } from "@/components/admin/IncidentForm";
import { PageSelect } from "@/components/admin/PageSelect";

export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = (await collections.pages().find({ orgId: oid(org.id), isHub: false }).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  const components = pageId
    ? (await collections.components().find({ pageId: oid(pageId) }).sort({ order: 1 }).toArray()).map(toId)
    : [];
  const templates = pageId
    ? (await collections.incidentTemplates().find({ pageId: oid(pageId) }).toArray()).map(toId)
    : [];

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Declare Incident</h1>
      <div className="bg-white border rounded-lg p-5 space-y-4">
        <label className="block text-sm">
          <span className="text-xs text-gray-500 block mb-1">Page</span>
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/incidents/new" selected={pageId} />
        </label>
        {pageId && <IncidentForm action={createIncident} pageId={pageId} components={components} templates={templates} />}
      </div>
    </div>
  );
}
