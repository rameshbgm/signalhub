"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { CheckRow } from "@/components/admin/operate-ui";
import {
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABEL,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABEL,
} from "@/lib/status";
import { INPUT_LIMITS } from "@/lib/input-limits";

const UPDATE_PLACEHOLDER = "What changed, who is affected, and when is the next update?";

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
    <form action={action} className="space-y-4">
      <Field label="Status" htmlFor="incident-update-status" className="sm:max-w-xs">
        <Select id="incident-update-status" aria-label="Update status" name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
          {INCIDENT_STATUSES.map((value) => <option key={value} value={value}>{INCIDENT_STATUS_LABEL[value]}</option>)}
        </Select>
      </Field>
      <Field label="Message" htmlFor="incident-update-body" required>
        <Textarea id="incident-update-body" name="body" maxLength={INPUT_LIMITS.body} value={body} onChange={(event) => setBody(event.target.value)} rows={4} placeholder={UPDATE_PLACEHOLDER} required />
      </Field>
      <CheckRow name="notify" checked={notify} onChange={(event) => setNotify(event.target.checked)} label="Notify subscribers" />
      <div className="flex justify-end">
        <Button type="submit"><Send aria-hidden size={16} />Post update</Button>
      </div>
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
    <form action={action} className="space-y-4">
      <Field label="Status" htmlFor="maintenance-update-status" className="sm:max-w-xs">
        <Select
          id="maintenance-update-status"
          aria-label="Maintenance status"
          name="maintenanceStatus"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {allowedStatuses.map((value) => (
            <option key={value} value={value}>
              {MAINTENANCE_STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Message" htmlFor="maintenance-update-body" required>
        <Textarea
          id="maintenance-update-body"
          name="body"
          maxLength={INPUT_LIMITS.body}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          placeholder={UPDATE_PLACEHOLDER}
          required
        />
      </Field>
      <CheckRow
        name="notify"
        checked={notify}
        onChange={(event) => setNotify(event.target.checked)}
        label="Notify subscribers about this update"
      />
      <div className="flex justify-end">
        <Button type="submit"><Send aria-hidden size={16} />Post maintenance update</Button>
      </div>
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
    <form action={action} className="space-y-4">
      <Field label="Postmortem" htmlFor="postmortem-body" hint="Shown as plain text on the public incident page, with line breaks kept.">
        <Textarea id="postmortem-body" name="postmortemBody" maxLength={INPUT_LIMITS.postmortem} rows={10} value={body} onChange={(event) => setBody(event.target.value)} placeholder={"## Summary\n## Timeline\n## Root cause\n## Remediation"} className="font-mono" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckRow
          name="publish"
          checked={publish}
          onChange={(event) => setPublish(event.target.checked)}
          label="Publish to the public page"
          hint={published ? (publish ? "Currently published." : "Saving will unpublish it.") : undefined}
        />
        <CheckRow
          name="notify"
          checked={!published && notify}
          onChange={(event) => setNotify(event.target.checked)}
          disabled={published || !publish}
          label="Notify subscribers when publishing"
          hint={published ? "Subscribers were offered this postmortem when it was first published." : undefined}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit">Save postmortem</Button>
      </div>
    </form>
  );
}
