import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { createMaintenance } from "../actions";
import { MaintenanceForm } from "@/components/admin/MaintenanceForm";
import { PageSelect } from "@/components/admin/PageSelect";
import { requireCapability, scopedPageFilter } from "@/lib/admin-guard";

export default async function NewMaintenancePage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("incident.manage");
  const { pageId: pageIdParam } = await searchParams;
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id, { isHub: false })).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  const components = pageId
    ? (await collections.components().find({ pageId: oid(pageId) }).sort({ order: 1 }).toArray()).map(toId)
    : [];
  const templates = pageId
    ? (await collections.incidentTemplates().find({
        pageId: oid(pageId),
        kind: "MAINTENANCE",
        archivedAt: null,
      }).toArray()).map(toId)
    : [];

  return (
    <div className="max-w-2xl">
      <h1 className="font-mono text-xl font-semibold text-[var(--fg)] mb-6">Schedule Maintenance</h1>
      <div className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5 space-y-4">
        <label className="block text-sm">
          <span className="text-xs text-[var(--fg-dim)] block mb-1">Page</span>
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/maintenance/new" selected={pageId} />
        </label>
        {pageId && (
          <MaintenanceForm
            action={createMaintenance}
            pageId={pageId}
            pageName={pages.find((page) => page.id === pageId)?.name ?? "Status page"}
            components={components}
            templates={templates}
          />
        )}
      </div>
    </div>
  );
}
