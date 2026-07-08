import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { createMaintenance } from "../actions";
import { MaintenanceForm } from "@/components/admin/MaintenanceForm";
import { PageSelect } from "@/components/admin/PageSelect";

export default async function NewMaintenancePage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = (await collections.pages().find({ orgId: oid(org.id), isHub: false }).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  const components = pageId
    ? (await collections.components().find({ pageId: oid(pageId) }).sort({ order: 1 }).toArray()).map(toId)
    : [];

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Schedule Maintenance</h1>
      <div className="bg-white border rounded-lg p-5 space-y-4">
        <label className="block text-sm">
          <span className="text-xs text-gray-500 block mb-1">Page</span>
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/maintenance/new" selected={pageId} />
        </label>
        {pageId && <MaintenanceForm action={createMaintenance} pageId={pageId} components={components} />}
      </div>
    </div>
  );
}
