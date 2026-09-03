import { requireSession } from "@/lib/require-session";
import { database } from "@/lib/postgres/client";
import { createIncident } from "../actions";
import { IncidentForm } from "@/components/admin/IncidentForm";
import { PageSelect } from "@/components/admin/PageSelect";
import { getScopedPages, requireCapability } from "@/lib/admin-guard";

export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("incident.manage");
  const { pageId: pageIdParam } = await searchParams;
  const pages = await getScopedPages(session, org.id, { isHub: false });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  const components = pageId
    ? await database.selectFrom("components").selectAll().where("pageId", "=", pageId).orderBy("order", "asc").execute()
    : [];

  return (
    <div className="max-w-2xl">
      <h1 className="font-mono text-xl font-semibold text-[var(--fg)] mb-6">Declare Incident</h1>
      <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5 space-y-4">
        <label className="block text-sm">
          <span className="text-xs text-[var(--fg-dim)] block mb-1">Page</span>
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/incidents/new" selected={pageId} />
        </label>
        {pageId && (
          <IncidentForm
            action={createIncident}
            pageId={pageId}
            components={components}
          />
        )}
      </div>
    </div>
  );
}
