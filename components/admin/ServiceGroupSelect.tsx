"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FolderTree, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { dangerGhost } from "@/components/admin/page-management-styles";
import { createGroup, deleteGroup } from "@/app/admin/(protected)/pages/[pageId]/components-actions";

export type ServiceGroupOption = { id: string; name: string; serviceCount: number };

/**
 * Group dropdown with an inline "+" that opens the group manager. Groups added
 * there are selected immediately and appear in every other group dropdown on
 * the page after the server refresh.
 */
export function ServiceGroupSelect({
  pageId,
  groups,
  id,
  name = "groupId",
  defaultValue = "",
  ariaLabel = "Service group",
}: {
  pageId: string;
  groups: ServiceGroupOption[];
  id: string;
  name?: string;
  defaultValue?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<ServiceGroupOption[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  // Show server data plus this popup's own changes until the refresh lands.
  const options = [
    ...groups,
    ...added.filter((group) => !groups.some((existing) => existing.id === group.id)),
  ].filter((group) => !removed.includes(group.id));

  function addGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    const groupName = draft.trim();
    if (!groupName) {
      setError("Enter a group name");
      return;
    }
    const formData = new FormData();
    formData.set("name", groupName);
    setError(null);
    startTransition(async () => {
      try {
        const result = await createGroup(pageId, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setAdded((current) => [...current, { ...result.group, serviceCount: 0 }]);
        setValue(result.group.id);
        setDraft("");
        router.refresh();
      } catch {
        setError("The group could not be added. Try again.");
      }
    });
  }

  function removeGroup(group: ServiceGroupOption) {
    const consequence = group.serviceCount
      ? ` Its ${group.serviceCount} ${group.serviceCount === 1 ? "service becomes" : "services become"} ungrouped.`
      : "";
    if (!window.confirm(`Delete the group "${group.name}"?${consequence}`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteGroup(pageId, group.id);
        setRemoved((current) => [...current, group.id]);
        if (value === group.id) setValue("");
        router.refresh();
      } catch {
        setError("The group could not be deleted. Reload and try again.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select id={id} aria-label={ariaLabel} name={name} value={value} onChange={(event) => setValue(event.target.value)} className="w-full">
            <option value="">No group</option>
            {options.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </Select>
        </div>
        <Button type="button" variant="secondary" size="icon" aria-label="Manage service groups" title="Add or manage groups" onClick={() => { setError(null); setOpen(true); }}>
          <Plus aria-hidden size={16} />
        </Button>
      </div>

      {/* Portaled: this picker sits inside service forms, and forms cannot nest. */}
      {open && createPortal(<Dialog open={open} onOpenChange={(_event, data) => setOpen(data.open)}>
        <DialogSurface>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Service groups</DialogTitle>
              <p className="mt-1 text-sm text-ink-soft">Groups organize related services on the public page.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)} className="-mr-2 -mt-1">
              <X aria-hidden size={16} />
            </Button>
          </div>

          {/* A separate form, so Enter here never submits the service form behind the popup. */}
          <form onSubmit={addGroup} className="mt-5 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor={`${id}-new-group`} className="sr-only">New group name</label>
              <Input
                id={`${id}-new-group`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g. Core platform"
                maxLength={120}
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-group-error` : undefined}
              />
            </div>
            <Button type="submit" data-button-guard="off" loading={pending} disabled={pending}>
              <Plus aria-hidden size={16} />Add group
            </Button>
          </form>
          {error && <p id={`${id}-group-error`} role="alert" className="mt-2 text-xs text-danger-fg">{error}</p>}

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-dim">
              {options.length ? `${options.length} ${options.length === 1 ? "group" : "groups"}` : "Groups"}
            </p>
            {options.length ? (
              <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line">
                {options.map((group) => (
                  <li key={group.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{group.name}</p>
                      <p className="text-xs text-ink-dim">{group.serviceCount} {group.serviceCount === 1 ? "service" : "services"}</p>
                    </div>
                    <Button type="button" data-button-guard="off" variant="ghost" size="sm" className={dangerGhost} disabled={pending} onClick={() => removeGroup(group)} aria-label={`Delete group ${group.name}`}>
                      <Trash2 aria-hidden size={14} />Delete
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 flex items-center gap-3 rounded-control border border-dashed border-line px-3.5 py-4 text-sm text-ink-soft">
                <FolderTree aria-hidden size={18} className="shrink-0 text-ink-dim" />
                No groups yet. Add one above to organize related services.
              </div>
            )}
          </div>
        </DialogSurface>
      </Dialog>, document.body)}
    </>
  );
}
