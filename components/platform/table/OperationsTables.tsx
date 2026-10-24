"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListChecks, RotateCw } from "lucide-react";
import { retryOperations } from "@/app/platform/(protected)/operations/actions";
import { ActionDialog, type DialogRequest } from "@/components/platform/table/ActionDialog";
import { formatDateTime, words } from "@/components/platform/table/format";
import { BulkBar, reportBatch, SelectAll, useSelection } from "@/components/platform/table/selection";
import { SortHead, type SortLink } from "@/components/platform/table/SortHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const guard = { "data-button-busy-mode": "interaction" } as const;
const JOB_TONE: Record<string, StatusTone> = { SUCCEEDED: "ok", FAILED: "danger", PROCESSING: "info", QUEUED: "warn", CANCELLED: "neutral" };

export type JobRow = { id: string; org: string; orgName: string; status: string; attempts: number; maxAttempts: number; createdAt: string; lastError: string | null; retryable: boolean };
export type DeliveryRow = { id: string; subject: string; channel: string; contact: string; attempts: number; updatedAt: string; lastError: string | null };

/** Shared by both tables: selection, a Retry bulk bar and the confirmation, so they behave identically. */
function useRetry<T extends { id: string }>(kind: "delivery" | "job", rows: T[], selectable: T[], describe: (row: T) => string) {
  const router = useRouter();
  const selection = useSelection(selectable.map((row) => row.id));
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chosen = selectable.filter((row) => selection.has(row.id));
  const noun = kind === "job" ? "job" : "delivery";

  function retry(targets: T[]) {
    if (targets.length === 0) return;
    const many = targets.length > 1;
    setDialog({
      title: many ? `Retry ${targets.length} ${noun === "job" ? "jobs" : "deliveries"}?` : `Retry this ${noun}?`, tone: "info", confirmLabel: many ? `Retry ${targets.length}` : "Retry",
      warning: kind === "job" ? "Each job is queued again with its attempt counter reset. Retries are idempotent; a purge resumes where it stopped." : "Each delivery is queued again with its attempt counter reset. If the cause is not fixed, it will land back here after its retries.",
      subjects: targets.map(describe),
      run: async () => {
        const result = await retryOperations(kind, targets.map((row) => row.id));
        const message = reportBatch("Queued for retry:", result, (id) => { const row = byId.get(id); return row ? describe(row) : id; });
        router.refresh();
        if (!message) selection.clear();
        return message;
      },
    });
  }
  return { selection, chosen, dialog, setDialog, retry };
}

export function JobsTable({ rows, canRetry, sorts, filtered }: { rows: JobRow[]; canRetry: boolean; sorts: Record<"created" | "status" | "attempts" | "org", SortLink>; filtered: boolean }) {
  const selectable = canRetry ? rows.filter((row) => row.retryable) : [];
  const { selection, chosen, dialog, setDialog, retry } = useRetry("job", rows, selectable, (row) => `Purge ${row.org}`);
  if (rows.length === 0) return <EmptyState icon={ListChecks} hue="violet" title={filtered ? "No jobs match these filters" : "No platform jobs yet"} description={filtered ? "Try a different search or clear the filters." : "Organization purges and other platform jobs appear here."} className="m-4 border-dashed bg-transparent py-12" />;
  return (
    <>
      {canRetry && <BulkBar count={chosen.length} noun="job" onClear={selection.clear}><Button {...guard} size="sm" variant="secondary" onClick={() => retry(chosen)}><RotateCw aria-hidden size={14} />Retry ({chosen.length})</Button></BulkBar>}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canRetry && <TableHead className="w-12 pr-0"><SelectAll label="Select all retryable jobs on this page" total={selectable.length} count={chosen.length} onChange={selection.setAll} /></TableHead>}
            <SortHead label="Job" link={sorts.org} />
            <SortHead label="Status" link={sorts.status} />
            <SortHead label="Attempts" link={sorts.attempts} className="max-sm:hidden" />
            <SortHead label="Queued" link={sorts.created} className="max-md:hidden" />
            <TableHead className="max-lg:hidden">Last error</TableHead>
            {canRetry && <TableHead className="!text-center">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={cn("odd:bg-surface even:bg-sunken/45", selection.has(row.id) && "!bg-primary-soft/70")}>
              {canRetry && <TableCell className="w-12 pr-0"><Checkbox aria-label={`Select the purge of ${row.org}`} checked={selection.has(row.id)} disabled={!row.retryable} onChange={() => selection.toggle(row.id)} /></TableCell>}
              <TableCell>
                <p className="font-medium text-ink">Purge <span className="font-mono text-sm">{row.org}</span></p>
                <p className="truncate text-xs text-ink-dim">{row.orgName}</p>
              </TableCell>
              <TableCell><StatusBadge tone={JOB_TONE[row.status] ?? "warn"}>{words(row.status)}</StatusBadge></TableCell>
              <TableCell className="tabular-nums max-sm:hidden">{row.attempts}/{row.maxAttempts}</TableCell>
              <TableCell className="whitespace-nowrap text-xs max-md:hidden">{formatDateTime(row.createdAt)}</TableCell>
              <TableCell className="max-w-xs text-xs max-lg:hidden">{row.lastError ? <span className="line-clamp-2 break-words text-danger-fg" title={row.lastError}>{row.lastError}</span> : <span className="text-ink-dim">None</span>}</TableCell>
              {canRetry && <TableCell className="text-center">{row.retryable && <Button {...guard} size="sm" variant="secondary" aria-label={`Retry the purge of ${row.org}`} onClick={() => retry([row])}><RotateCw aria-hidden size={14} /><span className="max-sm:sr-only">Retry</span></Button>}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ActionDialog request={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

export function DeliveriesTable({ rows, canRetry, sorts, filtered }: { rows: DeliveryRow[]; canRetry: boolean; sorts: Record<"updated" | "subject" | "channel" | "attempts", SortLink>; filtered: boolean }) {
  const selectable = canRetry ? rows : [];
  const { selection, chosen, dialog, setDialog, retry } = useRetry("delivery", rows, selectable, (row) => `${row.subject} · ${row.channel}`);
  if (rows.length === 0) return <EmptyState icon={CheckCircle2} hue="emerald" title={filtered ? "No deliveries match these filters" : "No terminal delivery failures"} description={filtered ? "Try a different search or clear the filters." : "Deliveries that exhaust their retries will appear here."} className="m-4 border-dashed bg-transparent py-12" />;
  return (
    <>
      {canRetry && <BulkBar count={chosen.length} noun="delivery" onClear={selection.clear}><Button {...guard} size="sm" variant="secondary" onClick={() => retry(chosen)}><RotateCw aria-hidden size={14} />Retry ({chosen.length})</Button></BulkBar>}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canRetry && <TableHead className="w-12 pr-0"><SelectAll label="Select all deliveries on this page" total={selectable.length} count={chosen.length} onChange={selection.setAll} /></TableHead>}
            <SortHead label="Delivery" link={sorts.subject} />
            <SortHead label="Channel" link={sorts.channel} className="max-sm:hidden" />
            <SortHead label="Attempts" link={sorts.attempts} className="max-md:hidden" />
            <SortHead label="Failed" link={sorts.updated} className="max-lg:hidden" />
            <TableHead>Error</TableHead>
            {canRetry && <TableHead className="!text-center">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={cn("odd:bg-surface even:bg-sunken/45", selection.has(row.id) && "!bg-primary-soft/70")}>
              {canRetry && <TableCell className="w-12 pr-0"><Checkbox aria-label={`Select ${row.subject}`} checked={selection.has(row.id)} onChange={() => selection.toggle(row.id)} /></TableCell>}
              <TableCell>
                <p className="max-w-xs truncate font-medium text-ink" title={row.subject}>{row.subject}</p>
                <p className="truncate font-mono text-2xs text-ink-dim">{row.contact}</p>
                <Badge className="mt-1 sm:hidden">{row.channel}</Badge>
              </TableCell>
              <TableCell className="max-sm:hidden"><Badge>{row.channel}</Badge></TableCell>
              <TableCell className="tabular-nums max-md:hidden">{row.attempts}</TableCell>
              <TableCell className="whitespace-nowrap text-xs max-lg:hidden">{formatDateTime(row.updatedAt)}</TableCell>
              <TableCell className="max-w-xs text-xs"><span className="line-clamp-2 break-words text-danger-fg" title={row.lastError ?? undefined}>{row.lastError ?? "Delivery exhausted"}</span></TableCell>
              {canRetry && <TableCell className="text-center"><Button {...guard} size="sm" variant="secondary" aria-label={`Retry ${row.subject}`} onClick={() => retry([row])}><RotateCw aria-hidden size={14} /><span className="max-sm:sr-only">Retry</span></Button></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ActionDialog request={dialog} onClose={() => setDialog(null)} />
    </>
  );
}
