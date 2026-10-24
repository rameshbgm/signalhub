"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Webhook } from "lucide-react";
import { setAuditSinksEnabled } from "@/app/platform/(protected)/audit/actions";
import { ActionDialog, type DialogRequest } from "@/components/platform/table/ActionDialog";
import { formatDate } from "@/components/platform/table/format";
import { BulkBar, reportBatch, SelectAll, useSelection } from "@/components/platform/table/selection";
import { SortHead, type SortLink } from "@/components/platform/table/SortHead";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SinkRow = { id: string; name: string; scope: string; host: string; enabled: boolean; deadLetters: number; createdAt: string };
const guard = { "data-button-busy-mode": "interaction" } as const;

export function SinksTable({ rows, canManage, sorts, filtered }: { rows: SinkRow[]; canManage: boolean; sorts: Record<"name" | "scope" | "status" | "created", SortLink>; filtered: boolean }) {
  const router = useRouter();
  const selection = useSelection(canManage ? rows.map((row) => row.id) : []);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chosen = canManage ? rows.filter((row) => selection.has(row.id)) : [];
  const stoppable = chosen.filter((row) => row.enabled);
  const startable = chosen.filter((row) => !row.enabled);

  function toggle(targets: SinkRow[], enabled: boolean) {
    if (targets.length === 0) return;
    const many = targets.length > 1;
    setDialog({
      title: enabled ? (many ? `Enable ${targets.length} sinks?` : "Enable this sink?") : (many ? `Disable ${targets.length} sinks?` : "Disable this sink?"),
      tone: enabled ? "info" : "warn", confirmLabel: `${enabled ? "Enable" : "Disable"}${many ? ` ${targets.length}` : ""}`,
      warning: enabled ? "Sealed audit entries are delivered to it again, starting with the ones that were waiting." : "Audit entries stop being forwarded to it. They stay in the audit log and are delivered if you enable it again.",
      subjects: targets.map((row) => `${row.name} · ${row.host}`),
      run: async () => {
        const result = await setAuditSinksEnabled(targets.map((row) => row.id), enabled);
        const message = reportBatch(enabled ? "Enabled" : "Disabled", result, (id) => byId.get(id)?.name ?? id);
        router.refresh();
        if (!message) selection.clear();
        return message;
      },
    });
  }

  if (rows.length === 0) {
    return <EmptyState icon={Webhook} hue="violet" title={filtered ? "No sinks match these filters" : "No external audit sinks configured"} description={filtered ? "Try a different search or clear the filters." : "Add a sink to forward sealed audit entries to your SIEM."} className="m-4 border-dashed bg-transparent py-12" />;
  }
  return (
    <>
      {canManage && (
        <BulkBar count={chosen.length} noun="sink" onClear={selection.clear}>
          <Button {...guard} size="sm" variant="secondary" disabled={stoppable.length === 0} onClick={() => toggle(stoppable, false)}><Pause aria-hidden size={14} />Disable ({stoppable.length})</Button>
          <Button {...guard} size="sm" variant="secondary" disabled={startable.length === 0} onClick={() => toggle(startable, true)}><Play aria-hidden size={14} />Enable ({startable.length})</Button>
        </BulkBar>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {canManage && <TableHead className="w-12 pr-0"><SelectAll label="Select all sinks on this page" total={rows.length} count={chosen.length} onChange={selection.setAll} /></TableHead>}
            <SortHead label="Sink" link={sorts.name} />
            <SortHead label="Scope" link={sorts.scope} className="max-sm:hidden" />
            <SortHead label="Status" link={sorts.status} />
            <TableHead className="max-md:hidden">Dead letters</TableHead>
            <SortHead label="Created" link={sorts.created} className="max-lg:hidden" />
            {canManage && <TableHead className="!text-center">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={cn("odd:bg-surface even:bg-sunken/45", selection.has(row.id) && "!bg-primary-soft/70")}>
              {canManage && <TableCell className="w-12 pr-0"><Checkbox aria-label={`Select ${row.name}`} checked={selection.has(row.id)} onChange={() => selection.toggle(row.id)} /></TableCell>}
              <TableCell><p className="font-medium text-ink">{row.name}</p><p className="truncate font-mono text-2xs text-ink-dim">{row.host}</p></TableCell>
              <TableCell className="text-xs max-sm:hidden">{row.scope}</TableCell>
              <TableCell><StatusBadge tone={row.enabled ? "ok" : "neutral"}>{row.enabled ? "Enabled" : "Disabled"}</StatusBadge></TableCell>
              <TableCell className="text-xs max-md:hidden">{row.deadLetters ? <StatusBadge tone="danger">{row.deadLetters} dead-letter</StatusBadge> : <span className="text-ink-dim">None</span>}</TableCell>
              <TableCell className="whitespace-nowrap text-xs max-lg:hidden">{formatDate(row.createdAt)}</TableCell>
              {canManage && <TableCell className="text-center"><Button {...guard} size="sm" variant="secondary" aria-label={`${row.enabled ? "Disable" : "Enable"} ${row.name}`} onClick={() => toggle([row], !row.enabled)}>{row.enabled ? <Pause aria-hidden size={14} /> : <Play aria-hidden size={14} />}<span className="max-sm:sr-only">{row.enabled ? "Disable" : "Enable"}</span></Button></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ActionDialog request={dialog} onClose={() => setDialog(null)} />
    </>
  );
}
