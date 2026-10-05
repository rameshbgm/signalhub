"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
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
                <Select
                  aria-label="Timeline status"
                  name="status"
                  defaultValue={update.status}
                  className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
                >
                  {INCIDENT_STATUSES.map((status) => (
                    <option key={status} value={status}>{INCIDENT_STATUS_LABEL[status]}</option>
                  ))}
                </Select>
                <Textarea
                  aria-label="Timeline message"
                  name="body"
                  defaultValue={update.body}
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
                  <Button variant="outline" size="sm" type="button" onClick={() => setEditingId(null)}>
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
                    variant="link"
                    size="sm"
                    type="button"
                    onClick={() => setEditingId(update.id)}
                    className="ml-auto"
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
