"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ShieldOff, Trash2, Unlock, UserCheck, UsersRound } from "lucide-react";
import { clearUserLockout } from "@/app/platform/(protected)/mfa-requests/actions";
import { runUserAction, type UserAction } from "@/app/platform/(protected)/users/actions";
import { UserMfaDialog } from "@/components/platform/table/UserMfaDialog";
import { ActionDialog, type DialogRequest } from "@/components/platform/table/ActionDialog";
import { BulkBar, reportBatch, SelectAll, useSelection } from "@/components/platform/table/selection";
import { SortHead, type SortLink } from "@/components/platform/table/SortHead";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { formatDate as date, words } from "@/components/platform/table/format";
import { cn } from "@/lib/utils";

export type UserRow = {
  id: string; name: string; email: string; username: string; disabled: boolean; createdAt: string;
  hasPassword: boolean; oidc: boolean; self: boolean;
  orgs: Array<{ name: string; role: string; status: string }>;
  mfa: { devices: number; lastUsedAt: string | null; lockedUntil: string | null; reenroll: boolean };
};


const COPY: Record<UserAction, { verb: string; title: (n: number) => string; label: string; tone: DialogRequest["tone"]; warning: (n: number) => React.ReactNode }> = {
  disable: {
    verb: "Disabled", label: "Disable", tone: "warn", title: (n) => (n === 1 ? "Disable this account?" : `Disable ${n} accounts?`),
    warning: () => "They are signed out right away and cannot sign in to any organization until re-enabled. Nothing is deleted.",
  },
  enable: {
    verb: "Enabled", label: "Enable", tone: "info", title: (n) => (n === 1 ? "Enable this account?" : `Enable ${n} accounts?`),
    warning: () => "They can sign in again with their existing credentials and memberships.",
  },
  delete: {
    verb: "Deleted", label: "Delete", tone: "danger", title: (n) => (n === 1 ? "Delete this account permanently?" : `Delete ${n} accounts permanently?`),
    warning: (n) => (
      <>
        <strong>This cannot be undone.</strong> {n === 1 ? "The account, its" : "The accounts, their"} memberships in every organization, active sessions and linked sign-in identities are removed.
        An account that has created records (pages, exports, identity connections) cannot be deleted; disable it instead.
      </>
    ),
  },
};

export function UsersTable({ rows, canMutate, canDelete, canManageMfa, sorts, filtered }: { rows: UserRow[]; canMutate: boolean; canDelete: boolean; canManageMfa: boolean; sorts: Record<"name" | "email" | "status" | "created", SortLink>; filtered: boolean }) {
  const router = useRouter();
  const selectable = rows.filter((row) => !row.self);
  const selection = useSelection(selectable.map((row) => row.id));
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [mfaTarget, setMfaTarget] = useState<UserRow | null>(null);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chosen = selectable.filter((row) => selection.has(row.id));

  function ask(action: UserAction, targets: UserRow[]) {
    if (targets.length === 0) return;
    const copy = COPY[action];
    setDialog({
      title: copy.title(targets.length), tone: copy.tone, confirmLabel: `${copy.label}${targets.length > 1 ? ` ${targets.length}` : ""}`,
      warning: copy.warning(targets.length), subjects: targets.map((row) => `${row.name} · ${row.email}`), askReason: true,
      run: async (reason) => {
        const result = await runUserAction(action, targets.map((row) => row.id), reason);
        const message = reportBatch(copy.verb, result, (id) => byId.get(id)?.email ?? id);
        router.refresh();
        if (!message) selection.clear();
        return message;
      },
    });
  }

  async function unlock(row: UserRow) {
    await clearUserLockout(row.id);
    router.refresh();
  }

  if (rows.length === 0) {
    return <EmptyState icon={UsersRound} hue="violet" title={filtered ? "No users match these filters" : "No users yet"} description={filtered ? "Try a different search or clear the filters." : "Accounts appear here once an organization admin creates them."} className="m-4 border-dashed bg-transparent py-12" />;
  }

  const disableable = chosen.filter((row) => !row.disabled);
  const enableable = chosen.filter((row) => row.disabled);
  return (
    <>
      {canMutate && (
        <BulkBar count={chosen.length} noun="user" onClear={selection.clear}>
          <Button data-button-busy-mode="interaction" size="sm" variant="secondary" disabled={disableable.length === 0} onClick={() => ask("disable", disableable)}><Ban aria-hidden size={14} />Disable ({disableable.length})</Button>
          <Button data-button-busy-mode="interaction" size="sm" variant="secondary" disabled={enableable.length === 0} onClick={() => ask("enable", enableable)}><UserCheck aria-hidden size={14} />Enable ({enableable.length})</Button>
          {canDelete && <Button data-button-busy-mode="interaction" size="sm" variant="destructive" onClick={() => ask("delete", chosen)}><Trash2 aria-hidden size={14} />Delete ({chosen.length})</Button>}
        </BulkBar>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canMutate && <TableHead className="w-12 pr-0"><SelectAll label="Select all users on this page" total={selectable.length} count={chosen.length} onChange={selection.setAll} /></TableHead>}
            <SortHead label="User" link={sorts.name} />
            <TableHead className="max-md:hidden">Organizations</TableHead>
            <TableHead className="max-lg:hidden">Sign-in</TableHead>
            <TableHead className="max-xl:hidden">MFA</TableHead>
            <SortHead label="Status" link={sorts.status} className="max-sm:hidden" />
            <SortHead label="Created" link={sorts.created} className="max-xl:hidden" />
            {canMutate && <TableHead className="!text-center">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const on = selection.has(row.id);
            return (
              <TableRow key={row.id} data-selected={on || undefined} className={cn("odd:bg-surface even:bg-sunken/45", on && "!bg-primary-soft/70", row.disabled && "text-ink-dim")}>
                {canMutate && <TableCell className="w-12 pr-0"><Checkbox aria-label={`Select ${row.email}`} checked={on} disabled={row.self} onChange={() => selection.toggle(row.id)} /></TableCell>}
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold", row.disabled ? "bg-sunken text-ink-dim" : "bg-primary-soft text-primary-ink")}>{row.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium text-ink">{row.name}{row.self && <span className="rounded-chip bg-info-bg px-1.5 py-0.5 text-2xs font-semibold text-info-fg">You</span>}</p>
                      <p className="truncate text-xs text-ink-soft">{row.email}</p>
                      <p className="truncate font-mono text-2xs text-ink-dim">{row.username}</p>
                      <StatusBadge tone={row.disabled ? "danger" : "ok"} className="mt-1 sm:hidden">{row.disabled ? "Disabled" : "Active"}</StatusBadge>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-md:hidden">
                  {row.orgs.length === 0 ? <span className="text-xs text-ink-dim">No memberships</span> : (
                    <ul className="space-y-0.5 text-xs">
                      {row.orgs.slice(0, 3).map((org, index) => <li key={index} className="truncate"><span className="font-medium text-ink">{org.name}</span> · {words(org.role)}{org.status !== "ACTIVE" && <span className="text-warn-fg"> · {words(org.status)}</span>}</li>)}
                      {row.orgs.length > 3 && <li className="text-ink-dim">+{row.orgs.length - 3} more</li>}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="text-xs max-lg:hidden">{[row.hasPassword && "Password", row.oidc && "SSO"].filter(Boolean).join(" + ") || "None"}</TableCell>
                <TableCell className="text-xs max-xl:hidden">
                  {row.mfa.lockedUntil ? <StatusBadge tone="danger">Locked out</StatusBadge>
                    : row.mfa.devices > 0 ? <StatusBadge tone="ok">{row.mfa.devices} {row.mfa.devices === 1 ? "device" : "devices"}</StatusBadge>
                      : row.mfa.reenroll ? <StatusBadge tone="warn">Must re-enroll</StatusBadge> : <StatusBadge tone="neutral">Not set up</StatusBadge>}
                  {row.mfa.lastUsedAt && <p className="mt-1 text-2xs text-ink-dim">Last used {date(row.mfa.lastUsedAt)}</p>}
                </TableCell>
                <TableCell className="max-sm:hidden"><StatusBadge tone={row.disabled ? "danger" : "ok"}>{row.disabled ? "Disabled" : "Active"}</StatusBadge></TableCell>
                <TableCell className="whitespace-nowrap text-xs max-xl:hidden">{date(row.createdAt)}</TableCell>
                {canMutate && (
                  <TableCell className="text-center">
                    {row.self ? <span className="text-xs text-ink-dim max-sm:hidden">Your account</span> : (
                      <div className="inline-flex items-center gap-1.5">
                        {canManageMfa && row.mfa.lockedUntil && <Button data-button-busy-mode="interaction" size="sm" variant="secondary" onClick={() => void unlock(row)} aria-label={`Clear MFA lockout for ${row.email}`}><Unlock aria-hidden size={14} /><span className="max-sm:sr-only">Unlock</span></Button>}
                        {canManageMfa && (row.mfa.devices > 0) && <Button data-button-busy-mode="interaction" size="sm" variant="secondary" onClick={() => setMfaTarget(row)} aria-label={`Manage MFA for ${row.email}`}><ShieldOff aria-hidden size={14} /><span className="max-sm:sr-only">MFA</span></Button>}
                        <Button data-button-busy-mode="interaction" size="sm" variant="secondary" onClick={() => ask(row.disabled ? "enable" : "disable", [row])} aria-label={`${row.disabled ? "Enable" : "Disable"} ${row.email}`}>
                          {row.disabled ? <UserCheck aria-hidden size={14} /> : <Ban aria-hidden size={14} />}
                          <span className="max-sm:sr-only">{row.disabled ? "Enable" : "Disable"}</span>
                        </Button>
                        {canDelete && <Button data-button-busy-mode="interaction" size="sm" variant="ghost" onClick={() => ask("delete", [row])} aria-label={`Delete ${row.email}`} className="hover:!bg-danger-bg hover:!text-danger-fg"><Trash2 aria-hidden size={14} /></Button>}
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ActionDialog request={dialog} onClose={() => setDialog(null)} />
      {mfaTarget && <UserMfaDialog user={mfaTarget} onClose={() => setMfaTarget(null)} onChanged={() => router.refresh()} />}
    </>
  );
}
