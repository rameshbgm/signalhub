import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";
import { INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, IMPACTS, IMPACT_LABEL } from "@/lib/status";
import { createTemplateGroup, createTemplate, deleteTemplate } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = await prisma.page.findMany({ where: { orgId: org.id, isHub: false }, orderBy: { createdAt: "asc" } });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  if (!pageId) {
    return <p className="text-sm text-gray-400">Create a page first.</p>;
  }

  const groups = await prisma.templateGroup.findMany({ where: { pageId }, include: { templates: true } });
  const ungroupedTemplates = await prisma.incidentTemplate.findMany({ where: { pageId, groupId: null } });
  const components = await prisma.component.findMany({ where: { pageId } });

  const boundCreateGroup = createTemplateGroup.bind(null, pageId);
  const boundCreateTemplate = createTemplate.bind(null, pageId);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Incident Templates</h1>
        <div className="w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/templates" selected={pageId} />
        </div>
      </div>

      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-sm mb-3">Template Groups</h2>
        <form action={boundCreateGroup} className="flex gap-2 mb-3">
          <input name="name" placeholder="Group name" className="flex-1 border rounded-md px-3 py-2 text-sm" required />
          <button className="bg-gray-800 text-white rounded-md px-3 py-2 text-sm">Add Group</button>
        </form>
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          {groups.map((g) => (
            <span key={g.id} className="bg-gray-100 rounded-full px-3 py-1">
              {g.name} ({g.templates.length})
            </span>
          ))}
        </div>
      </section>

      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-sm mb-3">New Template</h2>
        <form action={boundCreateTemplate} className="space-y-3">
          <input name="title" placeholder="Template title" className="w-full border rounded-md px-3 py-2 text-sm" required />
          <textarea name="body" placeholder="Body — use {{component}} as a placeholder" rows={3} className="w-full border rounded-md px-3 py-2 text-sm" />
          <div className="grid grid-cols-3 gap-3">
            <select name="groupId" className="border rounded-md px-3 py-2 text-sm">
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select name="defaultStatus" className="border rounded-md px-3 py-2 text-sm">
              {INCIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INCIDENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select name="defaultImpact" className="border rounded-md px-3 py-2 text-sm">
              {IMPACTS.map((i) => (
                <option key={i} value={i}>
                  {IMPACT_LABEL[i]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Default affected components</p>
            <div className="flex flex-wrap gap-3 border rounded-md p-2">
              {components.map((c) => (
                <label key={c.id} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="componentIds" value={c.id} /> {c.name}
                </label>
              ))}
            </div>
          </div>
          <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Save Template</button>
        </form>
      </section>

      <section className="space-y-2">
        {[...groups.flatMap((g) => g.templates), ...ungroupedTemplates].map((t) => (
          <div key={t.id} className="bg-white border rounded-lg p-3 text-sm flex items-start justify-between">
            <div>
              <p className="font-medium">{t.title}</p>
              <p className="text-gray-500 text-xs whitespace-pre-wrap">{t.body}</p>
            </div>
            <form action={deleteTemplate.bind(null, t.id)}>
              <button className="text-red-500 hover:underline text-xs">Delete</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
