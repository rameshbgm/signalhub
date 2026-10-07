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
import { BULK_PAGE_LIMIT, bulkDeletePhrase, matchesBulkDeletePhrase, pageCountLabel } from "@/lib/page-bulk";
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
  visible: boolean;
  setupDone: boolean;
  liveHref: string | null;
  setupHref: string | null;
};

const iconAction = (extra?: string) => buttonVariants({ variant: "ghost", size: "icon", className: cn("size-8", extra) });
const accessIcon = (type: string) => (type === "PUBLIC" ? Globe : type === "PRIVATE" ? Lock : Users);
const toneIcon = {
  view: "[&_svg]:!text-info-fg",
  edit: "[&_svg]:!text-primary-ink",
  publish: "[&_svg]:!text-ok-fg",
  hide: "[&_svg]:!text-warn-fg",
  remove: "[&_svg]:!text-ink-soft",
  setup: "[&_svg]:!text-warn-fg",
  delete: "hover:bg-danger-bg [&_svg]:!text-danger-fg",
};
const accessLabel = (type: string) => (type === "PUBLIC" ? "Public" : type === "PRIVATE" ? "Private" : "Audience");

/** Icon-only submit button; `label` is the accessible name and tooltip. */
function BulkButton({ intent, children, variant = "ghost", disabled = false, label, className }: { intent: string; children: ReactNode; variant?: "ghost" | "destructive"; disabled?: boolean; label: string; className?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" name="intent" value={intent} size="icon" variant={variant} className={cn("size-8", className)} disabled={disabled || pending} aria-label={label} title={label}>{children}</Button>;
}

/** Single-page action; submits through the same bulk server action with just this page. Feedback floats beside the icon (a card above clips anything below the row) and fades after 3s. With `confirm`, asks in a dialog first. */
function RowAction({ action, pageId, intent, label, done, className, confirm, children }: { action: (formData: FormData) => Promise<string>; pageId: string; intent: string; label: string; done: string; className?: string; confirm?: { title: string; body: string }; children: ReactNode }) {
  const [asking, setAsking] = useState(false);
  const formId = useId();
  const close = useCallback(() => setAsking(false), []);
  return (
    <PlatformActionForm id={formId} action={action} successMessage={done} className="relative flex" messageClassName="pointer-events-none absolute right-full top-1/2 z-10 mr-2 w-max max-w-64 -translate-y-1/2 animate-[sh-flash_3s_ease-out_forwards] empty:hidden">
      <input type="hidden" name="pageId" value={pageId} />
      {confirm ? (
        <>
          <input type="hidden" name="intent" value={intent} />
          <Button type="button" size="icon" variant="ghost" data-button-guard="off" className={cn("size-8", className)} aria-label={label} title={label} onClick={() => setAsking(true)}>{children}</Button>
          {asking && createPortal(
            <Dialog open onOpenChange={close}>
              <DialogSurface>
                <DialogTitle>{confirm.title}</DialogTitle>
                <p className="mt-3 text-sm leading-6 text-ink-soft">{confirm.body}</p>
                <DialogActions>
                  <Button type="button" variant="secondary" data-button-guard="off" onClick={close}>Cancel</Button>
                  <Button type="button" data-button-guard="off" onClick={() => { (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit(); close(); }}>{label.split(" ")[0]}</Button>
                </DialogActions>
              </DialogSurface>
            </Dialog>,
            document.body,
          )}
        </>
      ) : (
        <BulkButton intent={intent} label={label} className={className}>{children}</BulkButton>
      )}
    </PlatformActionForm>
  );
}

/** One collapsible group of pages (a hub's children, or standalone pages) with row selection and bulk actions. */
export function PageGroup({ header, rows, hubId, action, defaultOpen, canConfigure, label, empty, bare = false }: {
  header?: ReactNode;
  rows: PageRow[];
  hubId: string | null;
  // bulkPageAction bound to hubId on the server; a server action bound in the client cannot be passed back to the server.
  action: (formData: FormData) => Promise<string>;
  defaultOpen: boolean;
  canConfigure: boolean;
  label: string;
  empty?: ReactNode;
  /** Render only the bulk bar and rows (no card or collapse header), for use inside an existing card. */
  bare?: boolean;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen || bare);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  // Rows can vanish after an action (removed, deleted), so only count ids still listed.
  const chosen = rows.filter((row) => selected.has(row.id));
  const clear = useCallback(() => { setSelected(new Set()); setConfirmingDelete(false); setConfirmation(""); }, []);
  const closeDelete = () => { setConfirmingDelete(false); setConfirmation(""); };
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const allSelected = rows.length > 0 && chosen.length === rows.length;
  // Same rules bulkPageAction enforces server-side; the server stays authoritative and reports skipped pages.
  const overLimit = chosen.length > BULK_PAGE_LIMIT;
  const publishable = chosen.filter((row) => row.setupDone && !row.visible).length;
  const hideable = chosen.filter((row) => row.visible).length;
  const hiddenIds = chosen.map((row) => <input key={row.id} type="hidden" name="pageId" value={row.id} />);

  return (
    <section aria-label={label} className={bare ? undefined : "overflow-hidden rounded-card border border-line bg-surface shadow-card"}>
      {!bare && <div className="flex items-center gap-1 py-3 pl-2 pr-4">
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
      </div>}

      {open && (
        <div id={panelId} className={bare ? undefined : "border-t border-line"}>
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
                  {overLimit && <span role="alert" className="mr-auto text-xs font-medium text-danger-fg">Select {BULK_PAGE_LIMIT} pages or fewer</span>}
                  <BulkButton intent="publish" disabled={overLimit || !publishable} label={publishable ? `Publish ${pageCountLabel(publishable)}` : "Selected pages are already published or still in setup"} className={toneIcon.publish}><Eye aria-hidden size={16} /></BulkButton>
                  <BulkButton intent="hide" disabled={overLimit || !hideable} label={hideable ? `Unpublish ${pageCountLabel(hideable)}` : "Selected pages are already hidden"} className={toneIcon.hide}><EyeOff aria-hidden size={16} /></BulkButton>
                  {hubId && <BulkButton intent="remove" disabled={overLimit} label="Remove from hub" className={toneIcon.remove}><Unlink aria-hidden size={16} /></BulkButton>}
                  <Button type="button" size="icon" variant="ghost" className={cn("size-8", toneIcon.delete)} data-button-guard="off" disabled={overLimit} aria-label="Delete selected" title="Delete selected" onClick={() => setConfirmingDelete(true)}><Trash2 aria-hidden size={16} /></Button>
                  <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Clear selection" title="Clear selection" data-button-guard="off" onClick={clear}><X aria-hidden size={14} /></Button>
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
                    <div className="ml-auto flex items-center gap-0.5">
                      {row.setupHref && canConfigure ? (
                        <Link href={row.setupHref} aria-label={`Continue setup of ${row.name}`} title="Continue setup" className={iconAction(toneIcon.setup)}><Rocket aria-hidden size={16} /></Link>
                      ) : row.liveHref ? (
                        <a href={row.liveHref} target="_blank" rel="noreferrer" aria-label={`View ${row.name} live`} title="View live page" className={iconAction(toneIcon.view)}><ArrowUpRight aria-hidden size={16} /></a>
                      ) : null}
                      {canConfigure && <>
                        {row.setupDone && (
                          <RowAction action={action} pageId={row.id} intent={row.visible ? "hide" : "publish"} label={`${row.visible ? "Unpublish" : "Publish"} ${row.name}`} done={row.visible ? "Page unpublished" : "Page published"} confirm={row.visible ? { title: `Unpublish ${row.name}?`, body: "The public status page goes offline until you publish it again." } : { title: `Publish ${row.name}?`, body: "The status page becomes visible to everyone with access." }} className={row.visible ? toneIcon.hide : toneIcon.publish}>
                            {row.visible ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
                          </RowAction>
                        )}
                        {hubId && (
                          <RowAction action={action} pageId={row.id} intent="remove" label={`Remove ${row.name} from hub`} done="Removed from hub" className={toneIcon.remove}><Unlink aria-hidden size={16} /></RowAction>
                        )}
                        <button type="button" aria-label={`Delete ${row.name}`} title="Delete page" data-button-guard="off" className={iconAction(toneIcon.delete)} onClick={() => { setSelected(new Set([row.id])); setConfirmingDelete(true); }}><Trash2 aria-hidden size={16} /></button>
                        <Link href={`/organization/pages/${row.id}`} aria-label={`Edit ${row.name}`} title="Edit page" className={iconAction(toneIcon.edit)}><Pencil aria-hidden size={16} /></Link>
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
        <Dialog open onOpenChange={closeDelete}>
          <DialogSurface>
            <DialogTitle>Delete {pageCountLabel(chosen.length)} permanently?</DialogTitle>
            <PlatformActionForm action={action} successMessage="Pages deleted" onSuccess={clear} className="mt-3 space-y-4">
              {hiddenIds}
              <p className="text-sm leading-6 text-ink-soft">Deletes each page with its services, incidents, subscribers, metrics, monitors and assets. This cannot be undone.</p>
              <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm text-ink">{chosen.map((row) => <li key={row.id}>{row.name}</li>)}</ul>
              <label className="block space-y-1.5 text-sm text-ink-soft">
                <span>Type <code className="font-mono text-ink">{bulkDeletePhrase(chosen.length)}</code> to confirm</span>
                <Input name="confirmation" autoComplete="off" required autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
              <DialogActions>
                <Button type="button" variant="secondary" data-button-guard="off" onClick={closeDelete}>Cancel</Button>
                <BulkButton intent="delete" variant="destructive" label="Delete permanently" className="h-9 w-auto px-3.5" disabled={!matchesBulkDeletePhrase(confirmation, chosen.length)}>Delete permanently</BulkButton>
              </DialogActions>
            </PlatformActionForm>
          </DialogSurface>
        </Dialog>,
        document.body,
      )}
    </section>
  );
}
