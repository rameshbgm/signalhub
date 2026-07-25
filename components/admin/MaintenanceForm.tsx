"use client";

import { useState } from "react";
import {
  communicationTemplateValues,
  renderCommunicationTemplate,
  templateNotifyByDefault,
} from "@/components/admin/IncidentCommunicationForms";

type Component = { id: string; name: string };
type Template = { id: string; title: string; body: string; defaultComponentIds: string; notifyByDefault?: boolean };

function defaultDateTime(offsetHours: number) {
  const d = new Date(Date.now() + offsetHours * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function MaintenanceForm({
  action,
  pageId,
  pageName,
  components,
  templates = [],
}: {
  action: (formData: FormData) => void;
  pageId: string;
  pageName: string;
  components: Component[];
  templates?: Template[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);
  const [sendReminder, setSendReminder] = useState(true);

  function applyTemplate(template: Template) {
    let componentIds: string[] = [];
    try {
      const parsed: unknown = JSON.parse(template.defaultComponentIds || "[]");
      componentIds = Array.isArray(parsed)
        ? parsed.filter(
            (id): id is string =>
              typeof id === "string" &&
              components.some((component) => component.id === id)
          )
        : [];
    } catch {
      componentIds = [];
    }
    const componentNames = components
      .filter((component) => componentIds.includes(component.id))
      .map((component) => component.name);
    const baseValues = communicationTemplateValues({
      incidentName: template.title,
      pageName,
      componentNames,
      status: "SCHEDULED",
      impact: "NONE",
    });
    const nextName = renderCommunicationTemplate(template.title, baseValues);

    setName(nextName);
    setBody(
      renderCommunicationTemplate(template.body, {
        ...baseValues,
        incident: nextName,
        maintenance: nextName,
      })
    );
    setNotify(templateNotifyByDefault(template));
    setSelected(componentIds);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="pageId" value={pageId} />
      {templates.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-[var(--fg-dim)]">Apply a maintenance template</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button key={template.id} type="button" onClick={() => applyTemplate(template)} className="border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 text-xs">
                {template.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="block text-sm">
        <span className="text-xs text-[var(--fg-dim)] block mb-1">Title</span>
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs text-[var(--fg-dim)] block mb-1">Message</span>
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
          required
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-xs text-[var(--fg-dim)] block mb-1">Start</span>
          <input
            name="scheduledStart"
            type="datetime-local"
            defaultValue={defaultDateTime(24)}
            className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-[var(--fg-dim)] block mb-1">End</span>
          <input
            name="scheduledEnd"
            type="datetime-local"
            defaultValue={defaultDateTime(27)}
            className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
            required
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
        <input type="checkbox" name="pageWide" /> This maintenance affects the page as a whole
      </label>
      <div>
        <p className="text-xs text-[var(--fg-dim)] mb-2">Affected components (set to Under Maintenance during the window)</p>
        <div className="space-y-1 border border-[var(--line)] p-3 max-h-56 overflow-y-auto">
          {components.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--fg)]">
              <input
                type="checkbox"
                name="componentIds"
                value={c.id}
                checked={selected.includes(c.id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))}
              />
              {c.name}
            </label>
          ))}
          {components.length === 0 && <p className="text-xs text-[var(--fg-dim)]">No components on this page yet.</p>}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
        <input type="checkbox" name="autoTransition" defaultChecked /> Automatically start/complete based on the window above
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
        <input type="checkbox" name="notify" checked={notify} onChange={(event) => setNotify(event.target.checked)} /> Notify subscribers when scheduled and during automatic status transitions
      </label>
      <div className="space-y-2 border border-[var(--line)] bg-[var(--surface-raised)] p-3">
        <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
          <input
            type="checkbox"
            name="sendReminder"
            checked={sendReminder}
            onChange={(event) => setSendReminder(event.target.checked)}
          />{" "}
          Send one reminder before maintenance starts
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-[var(--fg-dim)]">
            Minutes before start
          </span>
          <input
            name="reminderMinutesBefore"
            type="number"
            min={5}
            max={7 * 24 * 60}
            defaultValue={60}
            disabled={!sendReminder}
            className="w-40 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none disabled:opacity-50"
            required={sendReminder}
          />
          <span className="ml-2 text-xs text-[var(--fg-dim)]">
            5 minutes to 7 days
          </span>
        </label>
      </div>
      <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-mono font-semibold">Schedule Maintenance</button>
    </form>
  );
}
