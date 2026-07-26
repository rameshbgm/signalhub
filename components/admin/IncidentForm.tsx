"use client";

import { useState } from "react";
import { FluentSelect } from "@/components/FluentSelect";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, IMPACTS, IMPACT_LABEL } from "@/lib/status";
import {
  communicationTemplateValues,
  renderCommunicationTemplate,
  templateNotifyByDefault,
} from "@/components/admin/IncidentCommunicationForms";

type Component = { id: string; name: string };
type Template = {
  id: string;
  title: string;
  body: string;
  defaultStatus: string;
  defaultImpact: string;
  defaultComponentIds: string;
  notifyByDefault?: boolean;
};

export function IncidentForm({
  action,
  pageId,
  pageName,
  components,
  templates,
}: {
  action: (formData: FormData) => void;
  pageId: string;
  pageName: string;
  components: Component[];
  templates: Template[];
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("INVESTIGATING");
  const [impact, setImpact] = useState("MAJOR");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [notify, setNotify] = useState(true);

  function applyTemplate(t: Template) {
    let ids: string[] = [];
    try {
      const parsed: unknown = JSON.parse(t.defaultComponentIds || "[]");
      ids = Array.isArray(parsed)
        ? parsed.filter(
            (id): id is string =>
              typeof id === "string" &&
              components.some((component) => component.id === id)
          )
        : [];
    } catch {
      ids = [];
    }
    const next: Record<string, string> = {};
    ids.forEach((id) => (next[id] = "MAJOR_OUTAGE"));
    const componentNames = components
      .filter((component) => ids.includes(component.id))
      .map((component) => component.name);
    const baseValues = communicationTemplateValues({
      incidentName: t.title,
      pageName,
      componentNames,
      status: t.defaultStatus,
      impact: t.defaultImpact,
    });
    const nextName = renderCommunicationTemplate(t.title, baseValues);

    setName(nextName);
    setBody(
      renderCommunicationTemplate(t.body, {
        ...baseValues,
        incident: nextName,
      })
    );
    setStatus(t.defaultStatus);
    setImpact(t.defaultImpact);
    setSelected(next);
    setNotify(templateNotifyByDefault(t));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="pageId" value={pageId} />

      {templates.length > 0 && (
        <div>
          <p className="text-xs text-[var(--fg-dim)] mb-1">Use a template:</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className="text-xs bg-[var(--surface-raised)] border border-[var(--line)] hover:border-[var(--line-bright)] text-[var(--fg-soft)] px-3 py-1"
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block text-sm">
        <span className="text-xs text-[var(--fg-dim)] block mb-1">Incident name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-xs text-[var(--fg-dim)] block mb-1">Message</span>
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
          required
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="block text-sm">
          <span className="text-xs text-[var(--fg-dim)] block mb-1">Status</span>
          <FluentSelect
            aria-label="Status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
          >
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INCIDENT_STATUS_LABEL[s]}
              </option>
            ))}
          </FluentSelect>
        </div>
        <div className="block text-sm">
          <span className="text-xs text-[var(--fg-dim)] block mb-1">Impact</span>
          <FluentSelect
            aria-label="Impact"
            name="impact"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
          >
            {IMPACTS.map((i) => (
              <option key={i} value={i}>
                {IMPACT_LABEL[i]}
              </option>
            ))}
          </FluentSelect>
        </div>
      </div>

      <div>
        <p className="text-xs text-[var(--fg-dim)] mb-2">Affected components</p>
        <div className="space-y-1 border border-[var(--line)] p-3 max-h-56 overflow-y-auto">
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
              <span className="flex-1 text-[var(--fg)]">{c.name}</span>
              {c.id in selected && (
                <FluentSelect
                  name={`componentStatus_${c.id}`}
                  value={selected[c.id]}
                  onChange={(e) => setSelected({ ...selected, [c.id]: e.target.value })}
                  className="bg-[var(--bg)] border border-[var(--line)] px-2 py-1 text-xs text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
                >
                  {COMPONENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {COMPONENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </FluentSelect>
              )}
            </div>
          ))}
          {components.length === 0 && <p className="text-xs text-[var(--fg-dim)]">No components on this page yet.</p>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
        <input type="checkbox" name="pageWide" /> This incident affects the page as a whole
      </label>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
          <input
            type="checkbox"
            name="notify"
            checked={notify}
            onChange={(event) => setNotify(event.target.checked)}
          />{" "}
          Notify subscribers
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
          <input type="checkbox" name="backfilled" /> Backfill (past incident, no notification)
        </label>
      </div>

      <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-mono font-semibold">Create Incident</button>
    </form>
  );
}
