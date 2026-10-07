"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal, useFormStatus } from "react-dom";
import { ArrowUpRight, ChevronDown, Eye, EyeOff, Globe, Lock, Pencil, Rocket, Trash2, Unlink, Users, X } from "lucide-react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogActions, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type PageRow = {
  id: string;
  name: string;
  slug: string;
  brand: string;
  state: string;
  tone: "ok" | "warn" | "neutral";
  type: string;
  event: { label: string; tone: "warn" | "info"; live: boolean } | null;
  liveHref: string | null;
  setupHref: string | null;
};

const iconAction = (extra?: string) => buttonVariants({ variant: "ghost", size: "icon", className: cn("size-8", extra) });
const accessIcon = (type: string) => (type === "PUBLIC" ? Globe : type === "PRIVATE" ? Lock : Users);
const accessLabel = (type: string) => (type === "PUBLIC" ? "Public" : type === "PRIVATE" ? "Private" : "Audience");
const plural = (count: number) => `${count} page${count === 1 ? "" : "s"}`;

function BulkButton({ intent, children, variant = "ghost" }: { intent: string; children: ReactNode; variant?: "ghost" | "destructive" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" name="intent" value={intent} size="sm" variant={variant} disabled={pending}>{children}</Button>;
}

/** One collapsible group of pages (a hub's children, or standalone pages) with row selection and bulk actions. */
export function PageGroup({ header, rows, hubId, action, defaultOpen, canConfigure, label, empty }: {
  header: ReactNode;
  rows: PageRow[];
  hubId: string | null;
  // bulkPageAction bound to hubId on the server; a server action bound in the client cannot be passed back to the server.
  action: (formData: FormData) => Promise<string>;
  defaultOpen: boolean;
  canConfigure: boolean;
  label: string;
  empty?: ReactNode;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Rows can vanish after an action (removed, deleted), so only count ids still listed.
  const chosen = rows.filter((row) => selected.has(row.id));
  const clear = useCallback(() => { setSelected(new Set()); setConfirmingDelete(false); }, []);
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const allSelected = rows.length > 0 && chosen.length === rows.length;
  const hiddenIds = chosen.map((row) => <input key={row.id} type="hidden" name="pageId" value={row.id} />);

  return (
    <section aria-label={label} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-1 py-3 pl-2 pr-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          data-button-guard="off"
          className={iconAction("shrink-0")}
        >
          <ChevronDown aria-hidden size={18} className={cn("text-ink-dim transition-transform duration-200 ease-soft", !open && "-rotate-90")} />
        </button>
        <div className="min-w-0 flex-1">{header}</div>
      </div>

      {open && (
        <div id={panelId} className="border-t border-line">
          {rows.length > 0 && canConfigure && (
            <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 bg-sunken/60 px-5 py-2">
              <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                <Checkbox
                  checked={allSelected}
                  ref={(input) => { if (input) input.indeterminate = chosen.length > 0 && !allSelected; }}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
                  aria-label={`Select all pages in ${label}`}
                />
                {chosen.length ? `${chosen.length} selected` : "Select all"}
              </label>
              {/* Stays mounted after the selection clears so the result message remains visible. */}
              <PlatformActionForm action={action} successMessage="Done" onSuccess={clear} className="flex flex-1 items-center justify-end gap-1" messageClassName="sm:text-right">
                {chosen.length > 0 && <>
                  {hiddenIds}
                  <BulkButton intent="publish"><Eye aria-hidden size={14} />Publish</BulkButton>
                  <BulkButton intent="hide"><EyeOff aria-hidden size={14} />Hide</BulkButton>
                  {hubId && <BulkButton intent="remove"><Unlink aria-hidden size={14} />Remove from hub</BulkButton>}
                  <Button type="button" size="sm" variant="ghost" className="text-danger-fg hover:bg-danger-bg" data-button-guard="off" onClick={() => setConfirmingDelete(true)}><Trash2 aria-hidden size={14} />Delete…</Button>
                  <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Clear selection" data-button-guard="off" onClick={clear}><X aria-hidden size={14} /></Button>
                </>}
              </PlatformActionForm>
            </div>
          )}

          {rows.length ? (
            <ul className="divide-y divide-line">
              {rows.map((row) => {
                const AccessIcon = accessIcon(row.type);
                return (
                  <li key={row.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-sunken/50", selected.has(row.id) && "bg-primary-soft/40")}>
                    {canConfigure && <Checkbox checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.name}`} />}
                    <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: row.brand }} />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm font-semibold text-ink" title={row.name}>{row.name}</p>
                      <p className="truncate font-mono text-xs text-ink-dim" title={`/${row.slug}`}>/{row.slug}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft"><AccessIcon aria-hidden size={14} className="text-ink-dim" />{accessLabel(row.type)}</span>
                    {row.event && (
                      <Link href={`/organization/events?pageId=${row.id}`} className="inline-flex rounded-chip outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
                        <StatusBadge tone={row.event.tone} live={row.event.live}>{row.event.label}</StatusBadge>
                      </Link>
                    )}
                    <StatusBadge tone={row.tone}>{row.state}</StatusBadge>
                    <div className="ml-auto flex items-center gap-1">
                      {row.setupHref && canConfigure ? (
                        <Link href={row.setupHref} className="mr-1 inline-flex items-center gap-1 rounded-chip text-xs font-semibold text-warn-fg outline-none hover:underline focus-visible:ring-4 focus-visible:ring-primary/25"><Rocket aria-hidden size={14} />Continue setup</Link>
                      ) : row.liveHref ? (
                        <a href={row.liveHref} target="_blank" rel="noreferrer" aria-label={`View ${row.name} live`} title="View live page" className={iconAction()}><ArrowUpRight aria-hidden size={16} /></a>
                      ) : null}
                      {canConfigure && <>
                        <Link href={`/organization/pages/${row.id}`} aria-label={`Edit ${row.name}`} title="Edit page" className={iconAction()}><Pencil aria-hidden size={15} /></Link>
                        <Link href={`/organization/pages/${row.id}/settings#delete-page`} aria-label={`Delete ${row.name}`} title="Delete page" className={iconAction("hover:bg-danger-bg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg")}><Trash2 aria-hidden size={15} /></Link>
                      </>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <div className="p-5">{empty}</div>}
        </div>
      )}

      {confirmingDelete && createPortal(
        <Dialog open onOpenChange={() => setConfirmingDelete(false)}>
          <DialogSurface>
            <DialogTitle>Delete {plural(chosen.length)} permanently?</DialogTitle>
            <PlatformActionForm action={action} successMessage="Pages deleted" onSuccess={clear} className="mt-3 space-y-4">
              {hiddenIds}
              <p className="text-sm leading-6 text-ink-soft">Deletes each page with its services, incidents, subscribers, metrics, monitors and assets. This cannot be undone.</p>
              <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm text-ink">{chosen.map((row) => <li key={row.id}>{row.name}</li>)}</ul>
              <label className="block space-y-1.5 text-sm text-ink-soft">
                <span>Type <code className="font-mono text-ink">delete {plural(chosen.length)}</code> to confirm</span>
                <Input name="confirmation" autoComplete="off" required autoFocus />
              </label>
              <DialogActions>
                <Button type="button" variant="secondary" data-button-guard="off" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
                <BulkButton intent="delete" variant="destructive">Delete permanently</BulkButton>
              </DialogActions>
            </PlatformActionForm>
          </DialogSurface>
        </Dialog>,
        document.body,
      )}
    </section>
  );
}
