"use client";

import { useState } from "react";
import { FluentSelect } from "@/components/FluentSelect";
import {
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABEL,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABEL,
} from "@/lib/status";

export function IncidentUpdateComposer({
  action,
  currentStatus,
}: {
  action: (formData: FormData) => void;
  currentStatus: string;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);

  return (
    <form action={action} className="space-y-3">
      <FluentSelect aria-label="Update status" name="status" value={status} onChange={(event) => setStatus(event.target.value)} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
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
}: {
  action: (formData: FormData) => void;
  currentStatus: string;
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

  return (
    <form action={action} className="space-y-3">
      <FluentSelect
        aria-label="Maintenance status"
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
}: {
  action: (formData: FormData) => void;
  initialBody: string;
  published: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [publish, setPublish] = useState(published);
  const [notify, setNotify] = useState(!published);

  return (
    <form action={action} className="space-y-3">
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
