"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { runOrganizationAction, type OrganizationAction } from "@/app/platform/(protected)/orgs/actions";
import { ActionDialog, type DialogRequest } from "@/components/platform/table/ActionDialog";
import { formatDate } from "@/components/platform/table/format";
import { BulkBar, reportBatch, SelectAll, useSelection } from "@/components/platform/table/selection";
import { SortHead, type SortLink } from "@/components/platform/table/SortHead";
import { SwitchOrganizationButton } from "@/components/platform/SwitchOrganizationButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type OrganizationRow = {
  id: string; name: string; slug: string; status: string; contactEmail: string | null;
  members: number; pages: number; createdAt: string; purgeCancellable: boolean; current: boolean;
};
type Permissions = { canSuspend: boolean; canPurge: boolean };

const TONE: Record<string, StatusTone> = { ACTIVE: "ok", SUSPENDED: "warn", DELETING: "danger", PROVISIONING: "info" };
const LABEL: Record<string, string> = { ACTIVE: "Active", SUSPENDED: "Suspended", DELETING: "Deleting", PROVISIONING: "Provisioning" };
const guard = { "data-button-busy-mode": "interaction" } as const;

type Copy = { verb: string; label: string; tone: DialogRequest["tone"]; title: (n: number) => string; warning: React.ReactNode };
const COPY: Record<Exclude<OrganizationAction, "purge">, Copy> = {
  suspend: {
    verb: "Suspended", label: "Suspend", tone: "warn",
    title: (n) => (n === 1 ? "Suspend this organization?" : `Suspend ${n} organizations?`),
    warning: "All tenant traffic is frozen: members cannot sign in, status pages stop updating and queued notifications are held. Nothing is deleted, and it can be reactivated at any time.",
  },
  reactivate: {
    verb: "Reactivated", label: "Reactivate", tone: "info",
    title: (n) => (n === 1 ? "Reactivate this organization?" : `Reactivate ${n} organizations?`),
    warning: "Members can sign in again and held notifications are sent.",
  },
  "cancel-purge": {
    verb: "Cancelled the purge of", label: "Cancel purge", tone: "info",
    title: (n) => (n === 1 ? "Cancel the queued purge?" : `Cancel ${n} queued purges?`),
    warning: "The organization goes back to Suspended with its data intact. This only works until a worker has started the purge.",
  },
};

export function OrganizationsTable({ rows, permissions, sorts, filtered }: { rows: OrganizationRow[]; permissions: Permissions; sorts: Record<"name" | "status" | "members" | "created", SortLink>; filtered: boolean }) {
  const router = useRouter();
  const { canSuspend, canPurge } = permissions;
  const selectable = canSuspend ? rows.filter((row) => row.status === "ACTIVE" || row.status === "SUSPENDED") : [];
  const selection = useSelection(selectable.map((row) => row.id));
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chosen = selectable.filter((row) => selection.has(row.id));
  const suspendable = chosen.filter((row) => row.status === "ACTIVE");
  const reactivatable = chosen.filter((row) => row.status === "SUSPENDED");

  function ask(action: Exclude<OrganizationAction, "purge">, targets: OrganizationRow[]) {
    if (targets.length === 0) return;
    const copy = COPY[action];
    setDialog({
      title: copy.title(targets.length), tone: copy.tone, confirmLabel: `${copy.label}${targets.length > 1 ? ` ${targets.length}` : ""}`,
      warning: copy.warning, subjects: targets.map((row) => `${row.name} · ${row.slug}`),
      run: async () => {
        const result = await runOrganizationAction(action, targets.map((row) => row.id));
        const message = reportBatch(copy.verb, result, (id) => byId.get(id)?.name ?? id);
        router.refresh();
        if (!message) selection.clear();
        return message;
      },
    });
  }

  function purge(row: OrganizationRow) {
    setDialog({
      title: "Permanently delete this organization?", tone: "danger", confirmLabel: "Queue purge", confirmText: row.slug,
      warning: <><strong>This cannot be undone.</strong> The organization, its pages, incidents, monitors, subscribers and members&apos; access are removed once the purge job runs. Accounts themselves are kept. You can cancel only until a worker starts the job.</>,
      subjects: [`${row.name} · ${row.slug}`],
      run: async (_reason, typed) => {
        const result = await runOrganizationAction("purge", [row.id], typed);
        const message = reportBatch("Queued the purge of", result, () => row.name);
        router.refresh();
        return message;
      },
    });
  }

  if (rows.length === 0) {
    return <EmptyState icon={Building2} hue="violet" title={filtered ? "No organizations match these filters" : "No organizations yet"} description={filtered ? "Try a different search or clear the filters." : "Provision the first organization to give a team its own workspace."} className="m-4 border-dashed bg-transparent py-12" />;
  }

  return (
    <>
      {canSuspend && (
        <BulkBar count={chosen.length} noun="organization" onClear={selection.clear}>
          <Button {...guard} size="sm" variant="secondary" disabled={suspendable.length === 0} onClick={() => ask("suspend", suspendable)}><Pause aria-hidden size={14} />Suspend ({suspendable.length})</Button>
          <Button {...guard} size="sm" variant="secondary" disabled={reactivatable.length === 0} onClick={() => ask("reactivate", reactivatable)}><Play aria-hidden size={14} />Reactivate ({reactivatable.length})</Button>
        </BulkBar>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canSuspend && <TableHead className="w-12 pr-0"><SelectAll label="Select all organizations on this page" total={selectable.length} count={chosen.length} onChange={selection.setAll} /></TableHead>}
            <SortHead label="Organization" link={sorts.name} />
            <SortHead label="Status" link={sorts.status} className="max-sm:hidden" />
            <SortHead label="Members" link={sorts.members} className="max-md:hidden" />
            <TableHead className="max-lg:hidden">Pages</TableHead>
            <SortHead label="Created" link={sorts.created} className="max-xl:hidden" />
            <TableHead className="!text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const on = selection.has(row.id);
            const settled = row.status === "ACTIVE" || row.status === "SUSPENDED";
            return (
              <TableRow key={row.id} className={cn("odd:bg-surface even:bg-sunken/45", on && "!bg-primary-soft/70")}>
                {canSuspend && <TableCell className="w-12 pr-0"><Checkbox aria-label={`Select ${row.name}`} checked={on} disabled={!settled} onChange={() => selection.toggle(row.id)} /></TableCell>}
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-sm font-semibold text-primary-ink max-sm:hidden">{row.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 max-sm:max-w-[9rem]">
                      <p className="flex items-center gap-2 truncate font-medium text-ink">{row.name}{row.current && <span className="rounded-chip bg-info-bg px-1.5 py-0.5 text-2xs font-semibold text-info-fg">Signed in</span>}</p>
                      <p className="truncate font-mono text-2xs text-ink-dim">{row.slug}<span className="max-md:hidden">{row.contactEmail ? ` · ${row.contactEmail}` : ""}</span></p>
                      <StatusBadge tone={TONE[row.status] ?? "neutral"} className="mt-1 sm:hidden">{LABEL[row.status] ?? row.status}</StatusBadge>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-sm:hidden"><StatusBadge tone={TONE[row.status] ?? "neutral"}>{LABEL[row.status] ?? row.status}</StatusBadge></TableCell>
                <TableCell className="tabular-nums max-md:hidden">{row.members}</TableCell>
                <TableCell className="tabular-nums max-lg:hidden">{row.pages}</TableCell>
                <TableCell className="whitespace-nowrap text-xs max-xl:hidden">{formatDate(row.createdAt)}</TableCell>
                <TableCell className="text-center">
                  <div className="inline-flex items-center gap-1.5">
                    {row.status === "ACTIVE" && <SwitchOrganizationButton organizationId={row.id} />}
                    {canSuspend && row.status === "ACTIVE" && <Button {...guard} size="sm" variant="secondary" aria-label={`Suspend ${row.name}`} onClick={() => ask("suspend", [row])}><Pause aria-hidden size={14} /><span className="max-sm:sr-only">Suspend</span></Button>}
                    {canSuspend && row.status === "SUSPENDED" && <Button {...guard} size="sm" variant="secondary" aria-label={`Reactivate ${row.name}`} onClick={() => ask("reactivate", [row])}><Play aria-hidden size={14} /><span className="max-sm:sr-only">Reactivate</span></Button>}
                    {canPurge && row.status === "SUSPENDED" && <Button {...guard} size="sm" variant="ghost" aria-label={`Delete ${row.name}`} onClick={() => purge(row)} className="hover:!bg-danger-bg hover:!text-danger-fg"><Trash2 aria-hidden size={14} /></Button>}
                    {canPurge && row.status === "DELETING" && (row.purgeCancellable
                      ? <Button {...guard} size="sm" variant="secondary" aria-label={`Cancel the purge of ${row.name}`} onClick={() => ask("cancel-purge", [row])}><RotateCcw aria-hidden size={14} /><span className="max-sm:sr-only">Cancel purge</span></Button>
                      : <span className="text-xs text-ink-dim max-sm:hidden">Purge running</span>)}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ActionDialog request={dialog} onClose={() => setDialog(null)} />
    </>
  );
}
