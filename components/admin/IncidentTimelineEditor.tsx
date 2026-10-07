"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { TimelineItem, TimelineList, incidentStatusTone } from "@/components/admin/operate-ui";
import {
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABEL,
  type IncidentStatus,
} from "@/lib/status";
import { INPUT_LIMITS } from "@/lib/input-limits";

type TimelineUpdate = {
  id: string;
  status: string;
  body: string;
  createdAtLabel: string;
  editedAtLabel: string | null;
  notified: boolean;
};

function SaveUpdateButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      loading={pending}
    >
      {pending ? "Saving…" : "Save update"}
    </Button>
  );
}

export function IncidentTimelineEditor({
  updates,
  action,
}: {
  updates: TimelineUpdate[];
  action: (updateId: string, formData: FormData) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <TimelineList>
      {updates.map((update, index) => {
        const editing = editingId === update.id;
        const newest = index === 0;
        return (
          <TimelineItem key={update.id} current={newest}>
            {editing ? (
              <form
                action={async (formData) => {
                  await action(update.id, formData);
                  setEditingId(null);
                }}
                className="space-y-4 rounded-card bg-sunken/50 p-4"
              >
                <Field label="Status" htmlFor={`timeline-status-${update.id}`} className="sm:max-w-xs">
                  <Select
                    id={`timeline-status-${update.id}`}
                    aria-label="Timeline status"
                    name="status"
                    defaultValue={update.status}
                  >
                    {INCIDENT_STATUSES.map((status) => (
                      <option key={status} value={status}>{INCIDENT_STATUS_LABEL[status]}</option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Message"
                  htmlFor={`timeline-body-${update.id}`}
                  hint={
                    <>
                      {newest
                        ? "Changing this status also updates the incident’s current state."
                        : "This edits historical timeline content without changing the incident’s current state."}
                      {update.notified ? " Previously delivered notifications are not resent." : ""}
                    </>
                  }
                >
                  <Textarea
                    id={`timeline-body-${update.id}`}
                    aria-label="Timeline message"
                    name="body"
                    maxLength={INPUT_LIMITS.body}
                    defaultValue={update.body}
                    rows={4}
                    required
                  />
                </Field>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                  <SaveUpdateButton />
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge tone={incidentStatusTone(update.status)}>
                    {INCIDENT_STATUS_LABEL[update.status as IncidentStatus] ?? update.status}
                  </StatusBadge>
                  <span className="text-xs text-ink-dim">{update.createdAtLabel}</span>
                  {update.editedAtLabel && <span className="text-xs text-ink-dim">Edited {update.editedAtLabel}</span>}
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setEditingId(update.id)}
                    className="ml-auto"
                  >
                    <Pencil aria-hidden size={14} />
                    Edit
                  </Button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{update.body}</p>
              </>
            )}
          </TimelineItem>
        );
      })}
    </TimelineList>
  );
}
