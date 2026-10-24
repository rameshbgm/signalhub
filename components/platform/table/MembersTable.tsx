"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, UserCog } from "lucide-react";
import { removeMembers, updateMemberRole } from "@/app/admin/(protected)/team/actions";
import { ActionDialog, type DialogRequest } from "@/components/platform/table/ActionDialog";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { BulkBar, reportBatch, SelectAll, useSelection } from "@/components/platform/table/selection";
import { SortHead, type SortLink } from "@/components/platform/table/SortHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogActions, DialogSurface } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MEMBERSHIP_ROLES } from "@/lib/identity";
import { formatDate as date, words } from "@/components/platform/table/format";
import { cn } from "@/lib/utils";

export type MemberRow = {
  id: string; name: string; email: string; username: string; role: string; status: string; createdAt: string;
  pageIds: string[] | null; self: boolean;
};

const TONE: Record<string, StatusTone> = { ACTIVE: "ok", INVITED: "warn" };

export function MembersTable({ rows, pages, orgName, sorts, filtered }: { rows: MemberRow[]; pages: Array<{ id: string; name: string }>; orgName: string; sorts: Record<"name" | "email" | "role" | "status" | "added", SortLink>; filtered: boolean }) {
  const router = useRouter();
  const selectable = rows.filter((row) => !row.self && row.status !== "REVOKED");
  const selection = useSelection(selectable.map((row) => row.id));
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chosen = selectable.filter((row) => selection.has(row.id));

  function remove(targets: MemberRow[]) {
    if (targets.length === 0) return;
    const many = targets.length > 1;
    setDialog({
      title: many ? `Remove ${targets.length} members?` : "Remove this member?", tone: "danger", confirmLabel: many ? `Remove ${targets.length}` : "Remove",
      warning: <><strong>They lose access to {orgName} immediately</strong> and their sessions for it are signed out. Their account and other organizations are not affected. To restore access, create the same email again.</>,
      subjects: targets.map((row) => `${row.name} · ${row.email}`),
      run: async () => {
        const result = await removeMembers(targets.map((row) => row.id));
        const message = reportBatch("Removed", result, (id) => byId.get(id)?.email ?? id);
        router.refresh();
        if (!message) selection.clear();
        return message;
      },
    });
  }

  if (rows.length === 0) {
    return <EmptyState icon={UserCog} hue="indigo" title={filtered ? "No members match these filters" : "No team members yet"} description={filtered ? "Try a different search or clear the filters." : "Add a member to give someone access to this organization."} className="m-4 border-dashed bg-transparent py-12" />;
  }

  return (
    <>
      <BulkBar count={chosen.length} noun="member" onClear={selection.clear}>
        <Button data-button-busy-mode="interaction" size="sm" variant="destructive" onClick={() => remove(chosen)}><Trash2 aria-hidden size={14} />Remove ({chosen.length})</Button>
      </BulkBar>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 pr-0"><SelectAll label="Select all members on this page" total={selectable.length} count={chosen.length} onChange={selection.setAll} /></TableHead>
            <SortHead label="Member" link={sorts.name} />
            <SortHead label="Role" link={sorts.role} className="max-sm:hidden" />
            <TableHead className="max-md:hidden">Page access</TableHead>
            <SortHead label="Status" link={sorts.status} className="max-sm:hidden" />
            <SortHead label="Added" link={sorts.added} className="max-xl:hidden" />
            <TableHead className="!text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const on = selection.has(row.id);
            const revoked = row.status === "REVOKED";
            return (
              <TableRow key={row.id} className={cn("odd:bg-surface even:bg-sunken/45", on && "!bg-primary-soft/70", revoked && "text-ink-dim")}>
                <TableCell className="w-12 pr-0"><Checkbox aria-label={`Select ${row.email}`} checked={on} disabled={row.self || revoked} onChange={() => selection.toggle(row.id)} /></TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold", revoked ? "bg-sunken text-ink-dim" : "bg-primary-soft text-primary-ink")}>{row.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium text-ink">{row.name}{row.self && <span className="rounded-chip bg-info-bg px-1.5 py-0.5 text-2xs font-semibold text-info-fg">You</span>}</p>
                      <p className="truncate text-xs text-ink-soft">{row.email}</p>
                      <p className="truncate font-mono text-2xs text-ink-dim">{row.username}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5 sm:hidden"><Badge>{words(row.role)}</Badge><StatusBadge tone={TONE[row.status] ?? "danger"}>{words(row.status)}</StatusBadge></div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-sm:hidden"><Badge>{words(row.role)}</Badge></TableCell>
                <TableCell className="text-xs max-md:hidden">
                  {row.pageIds === null || row.pageIds.length === 0 ? "All pages" : `${row.pageIds.length} selected page${row.pageIds.length === 1 ? "" : "s"}`}
                </TableCell>
                <TableCell className="max-sm:hidden"><StatusBadge tone={TONE[row.status] ?? "danger"}>{words(row.status)}</StatusBadge></TableCell>
                <TableCell className="whitespace-nowrap text-xs max-xl:hidden">{date(row.createdAt)}</TableCell>
                <TableCell className="text-center">
                  {row.self ? <span className="text-xs text-ink-dim max-sm:hidden">Your access</span> : revoked ? <span className="text-xs text-ink-dim max-sm:hidden">Removed</span> : (
                    <div className="inline-flex items-center gap-1.5">
                      <Button data-button-busy-mode="interaction" size="sm" variant="secondary" onClick={() => setEditing(row)} aria-label={`Edit access for ${row.email}`}><Pencil aria-hidden size={14} /><span className="max-sm:sr-only">Edit</span></Button>
                      <Button data-button-busy-mode="interaction" size="sm" variant="ghost" onClick={() => remove([row])} aria-label={`Remove ${row.email}`} className="hover:!bg-danger-bg hover:!text-danger-fg"><Trash2 aria-hidden size={14} /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ActionDialog request={dialog} onClose={() => setDialog(null)} />
      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogSurface className="max-w-md">
            <PlatformActionForm action={updateMemberRole.bind(null, editing.id)} successMessage="Access updated." onSuccess={() => setEditing(null)} preserveOnError className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink">Edit access</h2>
                <p className="truncate text-sm text-ink-soft">{editing.name} · {editing.email}</p>
              </div>
              <Field label="Role" htmlFor="edit-role">
                <Select aria-label="Role" id="edit-role" name="role" defaultValue={editing.role} className="w-full">
                  {MEMBERSHIP_ROLES.map((role) => <option key={role} value={role}>{words(role)}</option>)}
                </Select>
              </Field>
              <fieldset className="rounded-control border border-line p-3">
                <legend className="px-1 text-xs font-medium text-ink-soft">Page scope (none selected means all pages)</legend>
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {pages.length === 0 && <p className="text-xs text-ink-dim">This organization has no pages yet.</p>}
                  {pages.map((page) => (
                    <label key={page.id} className="flex items-center gap-2.5 text-sm text-ink-soft">
                      <Checkbox name="pageIds" value={page.id} defaultChecked={editing.pageIds?.includes(page.id)} />
                      {page.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <DialogActions>
                <Button data-button-busy-mode="interaction" type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit">Save access</Button>
              </DialogActions>
            </PlatformActionForm>
          </DialogSurface>
        </Dialog>
      )}
    </>
  );
}
