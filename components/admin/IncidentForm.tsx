"use client";

import { useState } from "react";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, IMPACTS, IMPACT_LABEL } from "@/lib/status";

type Component = { id: string; name: string };
type Template = { id: string; title: string; body: string; defaultStatus: string; defaultImpact: string; defaultComponentIds: string };

export function IncidentForm({
  action,
  pageId,
  components,
  templates,
}: {
  action: (formData: FormData) => void;
  pageId: string;
  components: Component[];
  templates: Template[];
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("INVESTIGATING");
  const [impact, setImpact] = useState("MAJOR");
  const [selected, setSelected] = useState<Record<string, string>>({});

  function applyTemplate(t: Template) {
    setName(t.title);
    setBody(t.body);
    setStatus(t.defaultStatus);
    setImpact(t.defaultImpact);
    try {
      const ids: string[] = JSON.parse(t.defaultComponentIds || "[]");
      const next: Record<string, string> = {};
      ids.forEach((id) => (next[id] = "MAJOR_OUTAGE"));
      setSelected(next);
    } catch {
      // ignore malformed template component list
    }
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="pageId" value={pageId} />

      {templates.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Use a template:</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button key={t.id} type="button" onClick={() => applyTemplate(t)} className="text-xs bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1">
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block text-sm">
        <span className="text-xs text-gray-500 block mb-1">Incident name</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" required />
      </label>

      <label className="block text-sm">
        <span className="text-xs text-gray-500 block mb-1">Message</span>
        <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full border rounded-md px-3 py-2 text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-xs text-gray-500 block mb-1">Status</span>
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INCIDENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-gray-500 block mb-1">Impact</span>
          <select name="impact" value={impact} onChange={(e) => setImpact(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
            {IMPACTS.map((i) => (
              <option key={i} value={i}>
                {IMPACT_LABEL[i]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Affected components</p>
        <div className="space-y-1 border rounded-md p-3 max-h-56 overflow-y-auto">
          {components.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="componentIds"
                value={c.id}
                checked={c.id in selected}
                onChange={(e) => {
                  const next = { ...selected };
                  if (e.target.checked) next[c.id] = "MAJOR_OUTAGE";
                  else delete next[c.id];
                  setSelected(next);
                }}
              />
              <span className="flex-1">{c.name}</span>
              {c.id in selected && (
                <select
                  name={`componentStatus_${c.id}`}
                  value={selected[c.id]}
                  onChange={(e) => setSelected({ ...selected, [c.id]: e.target.value })}
                  className="border rounded-md px-2 py-1 text-xs"
                >
                  {COMPONENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {COMPONENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {components.length === 0 && <p className="text-xs text-gray-400">No components on this page yet.</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify" defaultChecked /> Notify subscribers
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="backfilled" /> Backfill (past incident, no notification)
        </label>
      </div>

      <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Create Incident</button>
    </form>
  );
}
