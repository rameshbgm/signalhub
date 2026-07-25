import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, IMPACTS, IMPACT_LABEL } from "@/lib/status";
import { createTemplateGroup, createTemplate, deleteTemplate, duplicateTemplate, updateTemplate } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";
import { requireCapability, scopedPageFilter } from "@/lib/admin-guard";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("incident.manage");
  const { pageId: pageIdParam } = await searchParams;
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id, { isHub: false })).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;

  if (!pageId) {
    return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;
  }

  const [groupDocs, ungroupedTemplateDocs, componentDocs] = await Promise.all([
    collections.templateGroups().find({ pageId: oid(pageId) }).toArray(),
    collections.incidentTemplates().find({ pageId: oid(pageId), groupId: null, archivedAt: null }).toArray(),
    collections.components().find({ pageId: oid(pageId) }).toArray(),
  ]);
  const allTemplateDocs = await collections
    .incidentTemplates()
    .find({ pageId: oid(pageId), groupId: { $in: groupDocs.map((g) => g._id) }, archivedAt: null })
    .toArray();

  const ungroupedTemplates = ungroupedTemplateDocs.map(toId);
  const components = componentDocs.map(toId);
  const groups = groupDocs.map((g) => ({
    ...toId(g),
    templates: allTemplateDocs.filter((t) => t.groupId?.toHexString() === g._id.toHexString()).map(toId),
  }));

  const boundCreateGroup = createTemplateGroup.bind(null, pageId);
  const boundCreateTemplate = createTemplate.bind(null, pageId);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">Communication Templates</h1>
          <p className="mt-1 text-sm text-[var(--fg-soft)]">Reusable, previewable messages for the full incident lifecycle.</p>
        </div>
        <div className="w-full sm:w-56">
          <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/templates" selected={pageId} />
        </div>
      </div>

      <section className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold text-sm text-[var(--fg)] mb-3">Template Groups</h2>
        <form action={boundCreateGroup} className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            name="name"
            placeholder="Group name"
            className="flex-1 bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
            required
          />
          <button className="bg-[var(--surface-raised)] border border-[var(--line-bright)] text-[var(--fg)] px-3 py-2 text-sm font-mono">Add Group</button>
        </form>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--fg-soft)]">
          {groups.map((g) => (
            <span key={g.id} className="bg-[var(--surface-raised)] border border-[var(--line)] px-3 py-1">
              {g.name} ({g.templates.length})
            </span>
          ))}
        </div>
      </section>

      <section className="bg-[var(--surface)] border border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-mono font-semibold text-sm text-[var(--fg)] mb-3">New Template</h2>
        <form action={boundCreateTemplate} className="space-y-3">
          <input
            name="title"
            placeholder="Template title"
            className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
            required
          />
          <textarea
            name="body"
            placeholder="Body — use {{component}} as a placeholder"
            rows={3}
            className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select name="kind" className="bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)]">
              <option value="INCIDENT">New incident</option>
              <option value="UPDATE">Incident update</option>
              <option value="RESOLUTION">Resolution</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="POSTMORTEM">Postmortem</option>
            </select>
            <select name="groupId" className="bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select name="defaultStatus" className="bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
              {INCIDENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INCIDENT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select name="defaultImpact" className="bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
              {IMPACTS.map((i) => (
                <option key={i} value={i}>
                  {IMPACT_LABEL[i]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
            <input type="checkbox" name="notifyByDefault" defaultChecked /> Notify subscribers by default
          </label>
          <div>
            <p className="text-xs text-[var(--fg-dim)] mb-1">Default affected components</p>
            <div className="flex flex-wrap gap-3 border border-[var(--line)] p-2">
              {components.map((c) => (
                <label key={c.id} className="flex items-center gap-1 text-xs text-[var(--fg-soft)]">
                  <input type="checkbox" name="componentIds" value={c.id} /> {c.name}
                </label>
              ))}
            </div>
          </div>
          <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-mono font-semibold">Save Template</button>
        </form>
      </section>

      <section className="space-y-2">
        {[...groups.flatMap((g) => g.templates), ...ungroupedTemplates].map((t) => (
          <div key={t.id} className="bg-[var(--surface)] border border-[var(--line)] p-4 text-sm">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-[var(--fg)]">{t.title}</p>
                <span className="bg-[var(--cyan-soft)] px-2 py-0.5 font-mono text-[10px] text-[var(--cyan)]">{t.kind ?? "INCIDENT"}</span>
                {t.variables?.map((variable) => <span key={variable} className="bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-dim)]">{`{{${variable}}}`}</span>)}
              </div>
              <p className="text-[var(--fg-dim)] text-xs whitespace-pre-wrap">{t.body}</p>
            </div>
            <details className="mt-3 border-t border-[var(--line)] pt-3">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--cyan)]">Edit template</summary>
              <form action={updateTemplate.bind(null, t.id)} className="mt-3 space-y-2">
                <input name="title" defaultValue={t.title} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2" required />
                <textarea name="body" defaultValue={t.body} rows={4} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2" required />
                <div className="flex flex-wrap gap-3">
                  <select name="kind" defaultValue={t.kind ?? "INCIDENT"} className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs">
                    <option value="INCIDENT">New incident</option><option value="UPDATE">Incident update</option><option value="RESOLUTION">Resolution</option><option value="MAINTENANCE">Maintenance</option><option value="POSTMORTEM">Postmortem</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="notifyByDefault" defaultChecked={t.notifyByDefault ?? true} /> Notify by default</label>
                  <button className="bg-[var(--cyan)] px-3 py-2 text-xs font-semibold text-[var(--on-cyan)]">Save changes</button>
                </div>
              </form>
            </details>
            <div className="mt-3 flex gap-2">
              <form action={duplicateTemplate.bind(null, t.id)}><button className="border border-[var(--line)] px-2.5 py-1 text-xs">Duplicate</button></form>
              <form action={deleteTemplate.bind(null, t.id)}><button className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)]">Archive</button></form>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
