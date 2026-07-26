"use client";

import { useState } from "react";
import { FluentSelect } from "@/components/FluentSelect";
import {
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABEL,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABEL,
} from "@/lib/status";

type Template = {
  id: string;
  title: string;
  body: string;
  kind?: string;
  defaultStatus: string;
  notifyByDefault?: boolean;
};

export function renderCommunicationTemplate(
  value: string,
  values: Record<string, string>
) {
  return value.replace(
    /\{\{\s*([a-zA-Z][\w.-]*)\s*\}\}/g,
    (match, key: string) => values[key] ?? match
  );
}

export function communicationTemplateValues(input: {
  incidentName: string;
  pageName: string;
  componentNames?: string[];
  status?: string;
  impact?: string;
}) {
  const components = input.componentNames?.join(", ") || "all services";
  return {
    incident: input.incidentName,
    maintenance: input.incidentName,
    page: input.pageName,
    component: components,
    components,
    status: input.status ?? "",
    impact: input.impact ?? "",
  };
}

export function templateNotifyByDefault(template: {
  notifyByDefault?: boolean;
}) {
  return template.notifyByDefault ?? true;
}

export function IncidentUpdateComposer({
  action,
  currentStatus,
  incidentName,
  pageName,
  componentNames,
  templates,
}: {
  action: (formData: FormData) => void;
  currentStatus: string;
  incidentName: string;
  pageName: string;
  componentNames: string[];
  templates: Template[];
}) {
  const [status, setStatus] = useState(currentStatus);
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);

  function apply(template: Template) {
    const nextStatus =
      template.kind === "RESOLUTION"
        ? "RESOLVED"
        : template.defaultStatus || currentStatus;
    setStatus(nextStatus);
    setBody(
      renderCommunicationTemplate(
        template.body,
        communicationTemplateValues({
          incidentName,
          pageName,
          componentNames,
          status: nextStatus,
        })
      )
    );
    setNotify(templateNotifyByDefault(template));
  }

  return (
    <form action={action} className="space-y-3">
      {templates.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-[var(--fg-dim)]">Apply a communication template</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button key={template.id} type="button" onClick={() => apply(template)} className="border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs">
                {template.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <FluentSelect name="status" value={status} onChange={(event) => setStatus(event.target.value)} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
        {INCIDENT_STATUSES.map((value) => <option key={value} value={value}>{INCIDENT_STATUS_LABEL[value]}</option>)}
      </FluentSelect>
      <textarea name="body" value={body} onChange={(event) => setBody(event.target.value)} rows={4} placeholder="What changed, who is affected, and when is the next update?" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" required />
      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]"><input type="checkbox" name="notify" checked={notify} onChange={(event) => setNotify(event.target.checked)} /> Notify subscribers</label>
      <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">Post update</button>
    </form>
  );
}

export function MaintenanceUpdateComposer({
  action,
  currentStatus,
  incidentName,
  pageName,
  componentNames,
  templates,
}: {
  action: (formData: FormData) => void;
  currentStatus: string;
  incidentName: string;
  pageName: string;
  componentNames: string[];
  templates: Template[];
}) {
  const [status, setStatus] = useState(currentStatus);
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);
  const allowedStatuses =
    ({
      SCHEDULED: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"],
      IN_PROGRESS: ["IN_PROGRESS", "VERIFYING", "COMPLETED"],
      VERIFYING: ["VERIFYING", "IN_PROGRESS", "COMPLETED"],
      COMPLETED: ["COMPLETED"],
    } as Record<string, readonly (typeof MAINTENANCE_STATUSES)[number][]>)[
      currentStatus
    ] ?? [];

  function apply(template: Template) {
    const templateStatus = MAINTENANCE_STATUSES.includes(
      template.defaultStatus as (typeof MAINTENANCE_STATUSES)[number]
    )
      ? (template.defaultStatus as (typeof MAINTENANCE_STATUSES)[number])
      : null;
    const nextStatus =
      templateStatus && allowedStatuses.includes(templateStatus)
        ? templateStatus
        : currentStatus;
    setStatus(nextStatus);
    setBody(
      renderCommunicationTemplate(
        template.body,
        communicationTemplateValues({
          incidentName,
          pageName,
          componentNames,
          status: nextStatus,
        })
      )
    );
    setNotify(templateNotifyByDefault(template));
  }

  return (
    <form action={action} className="space-y-3">
      {templates.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-[var(--fg-dim)]">
            Apply a maintenance template
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => apply(template)}
                className="border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs"
              >
                {template.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <FluentSelect
        name="maintenanceStatus"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
      >
        {allowedStatuses.map((value) => (
          <option key={value} value={value}>
            {MAINTENANCE_STATUS_LABEL[value]}
          </option>
        ))}
      </FluentSelect>
      <textarea
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        placeholder="What changed, who is affected, and when is the next update?"
        className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
        required
      />
      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
        <input
          type="checkbox"
          name="notify"
          checked={notify}
          onChange={(event) => setNotify(event.target.checked)}
        />{" "}
        Notify subscribers about this update
      </label>
      <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">
        Post maintenance update
      </button>
    </form>
  );
}

export function PostmortemComposer({
  action,
  initialBody,
  published,
  incidentName,
  pageName,
  componentNames,
  templates,
}: {
  action: (formData: FormData) => void;
  initialBody: string;
  published: boolean;
  incidentName: string;
  pageName: string;
  componentNames: string[];
  templates: Template[];
}) {
  const [body, setBody] = useState(initialBody);
  const [publish, setPublish] = useState(published);
  const [notify, setNotify] = useState(!published);

  function apply(template: Template) {
    setBody(
      renderCommunicationTemplate(
        template.body,
        communicationTemplateValues({
          incidentName,
          pageName,
          componentNames,
          status: "RESOLVED",
        })
      )
    );
    setNotify(templateNotifyByDefault(template));
  }

  return (
    <form action={action} className="space-y-3">
      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <button key={template.id} type="button" onClick={() => apply(template)} className="border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs">
              {template.title}
            </button>
          ))}
        </div>
      )}
      <textarea name="postmortemBody" rows={10} value={body} onChange={(event) => setBody(event.target.value)} placeholder={"## Summary\n## Timeline\n## Root cause\n## Remediation"} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-sm" />
      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
        <input
          type="checkbox"
          name="publish"
          checked={publish}
          onChange={(event) => setPublish(event.target.checked)}
        />{" "}
        Publish to the public page
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--fg-soft)]">
        <input
          type="checkbox"
          name="notify"
          checked={notify}
          onChange={(event) => setNotify(event.target.checked)}
          disabled={!publish}
        />{" "}
        Notify subscribers when publishing
      </label>
      <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">Save postmortem</button>
    </form>
  );
}
