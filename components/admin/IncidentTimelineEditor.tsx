"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Textarea } from "@fluentui/react-components";
import { FluentSelect } from "@/components/FluentSelect";
import {
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABEL,
  type IncidentStatus,
} from "@/lib/status";

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
      appearance="primary"
      shape="square"
      type="submit"
      disabled={pending}
      className="bg-[var(--cyan)] text-[var(--on-cyan)]"
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
    <div className="space-y-3">
      {updates.map((update, index) => {
        const editing = editingId === update.id;
        const newest = index === 0;
        return (
          <div key={update.id} className="border-l-2 border-[var(--line)] pl-3 text-sm">
            {editing ? (
              <form
                action={async (formData) => {
                  await action(update.id, formData);
                  setEditingId(null);
                }}
                className="space-y-2"
              >
                <FluentSelect
                  aria-label="Timeline status"
                  name="status"
                  defaultValue={update.status}
                  className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
                >
                  {INCIDENT_STATUSES.map((status) => (
                    <option key={status} value={status}>{INCIDENT_STATUS_LABEL[status]}</option>
                  ))}
                </FluentSelect>
                <Textarea
                  aria-label="Timeline message"
                  name="body"
                  defaultValue={update.body}
                  resize="vertical"
                  rows={4}
                  required
                  className="w-full rounded-none border border-[var(--line)] bg-[var(--bg)] text-sm"
                />
                <p className="text-xs text-[var(--fg-dim)]">
                  {newest
                    ? "Changing this status also updates the incident’s current state."
                    : "This edits historical timeline content without changing the incident’s current state."}
                  {update.notified ? " Previously delivered notifications are not resent." : ""}
                </p>
                <div className="flex gap-2">
                  <SaveUpdateButton />
                  <Button appearance="outline" shape="square" type="button" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--fg)]">
                    {INCIDENT_STATUS_LABEL[update.status as IncidentStatus] ?? update.status}
                  </span>
                  <span className="text-xs text-[var(--fg-dim)]">{update.createdAtLabel}</span>
                  {update.editedAtLabel && <span className="text-[10px] text-[var(--fg-dim)]">Edited {update.editedAtLabel}</span>}
                  <Button
                    appearance="transparent"
                    shape="square"
                    size="small"
                    type="button"
                    onClick={() => setEditingId(update.id)}
                    className="ml-auto underline"
                  >
                    Edit
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-[var(--fg-soft)]">{update.body}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
