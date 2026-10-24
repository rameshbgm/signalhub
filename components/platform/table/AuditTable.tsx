"use client";

import { Fragment, useState } from "react";
import { ChevronRight, ScrollText, ShieldCheck, ShieldQuestion } from "lucide-react";
import { ago, formatDate, formatTime } from "@/components/platform/table/format";
import { SortHead, type SortLink } from "@/components/platform/table/SortHead";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type AuditRow = {
  id: string; createdAt: string; action: string; actorEmail: string; actorRole: string; actorId: string | null;
  targetType: string; targetId: string; organizationId: string | null; organizationName: string | null;
  reason: string | null; metadata: unknown; sequence: string | null; entryHash: string | null; previousHash: string | null;
};

/** The dot colour says what kind of event it is; the action name always carries the meaning. */
function dot(action: string) {
  if (/(DELETE|PURGE|SUSPEND|DISABLED|FAIL|REVOKE|REVERT|DENIED)/.test(action)) return "bg-danger";
  if (/(CREATE|ENABLED|REACTIVATED|CONFIRM|RESTORE|LOGIN)/.test(action)) return "bg-ok";
  if (/(UPDATE|RETRY|RETRIED|CHANGE)/.test(action)) return "bg-warn";
  return "bg-info";
}

const hasMetadata = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && Object.keys(value).length > 0);

export function AuditTable({ rows, now, sorts, filtered }: { rows: AuditRow[]; now: number; sorts: Record<"when" | "action" | "actor" | "target", SortLink>; filtered: boolean }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setOpen((previous) => { const next = new Set(previous); if (!next.delete(id)) next.add(id); return next; });
  if (rows.length === 0) {
    return <EmptyState icon={ScrollText} hue="violet" title={filtered ? "No audit entries match these filters" : "No audit entries yet"} description={filtered ? "Clear the filters to see all platform activity." : "Operator actions are recorded here as they happen."} className="m-4 border-dashed bg-transparent py-12" />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 pr-0"><span className="sr-only">Details</span></TableHead>
          <SortHead label="When (UTC)" link={sorts.when} />
          <SortHead label="Action" link={sorts.action} />
          <SortHead label="Actor" link={sorts.actor} />
          <SortHead label="Target" link={sorts.target} className="max-md:hidden" />
          <TableHead className="max-lg:hidden">Organization</TableHead>
          <TableHead className="max-xl:hidden">Reason</TableHead>
          <TableHead className="text-right max-lg:hidden">Seq</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const expanded = open.has(row.id);
          const sealed = Boolean(row.entryHash);
          return (
            <Fragment key={row.id}>
              <TableRow className={cn("odd:bg-surface even:bg-sunken/45 align-top", expanded && "!bg-primary-soft/40")}>
                <TableCell className="w-10 pr-0">
                  <button type="button" onClick={() => toggle(row.id)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} details of ${row.action}`}
                    className="grid size-7 place-items-center rounded-control text-ink-dim outline-none transition-colors hover:bg-sunken hover:text-ink focus-visible:ring-[3px] focus-visible:ring-primary/30">
                    <ChevronRight aria-hidden size={15} className={cn("transition-transform", expanded && "rotate-90")} />
                  </button>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <time dateTime={row.createdAt} className="block text-ink">{formatDate(row.createdAt)}</time>
                  <span className="block font-mono text-2xs text-ink-soft">{formatTime(row.createdAt)}</span>
                  <span className="block text-2xs text-ink-dim">{ago(row.createdAt, now)}</span>
                </TableCell>
                <TableCell>
                  <p className="flex items-start gap-2 font-mono text-xs font-medium text-ink"><span aria-hidden className={cn("mt-1 size-2 shrink-0 rounded-full", dot(row.action))} /><span className="min-w-0">{row.action.split("_").map((part, index, all) => <Fragment key={index}>{part}{index < all.length - 1 && <>_<wbr /></>}</Fragment>)}</span></p>
                </TableCell>
                <TableCell className="text-xs">
                  <p className="[overflow-wrap:anywhere] text-ink">{row.actorEmail}</p>
                  <Badge className="mt-1">{row.actorRole}</Badge>
                </TableCell>
                <TableCell className="text-xs max-md:hidden"><p className="break-all font-mono text-ink-soft"><span className="text-ink-dim">{row.targetType}:</span>{row.targetId}</p></TableCell>
                <TableCell className="text-xs max-lg:hidden">{row.organizationId ? <span className="text-ink">{row.organizationName ?? "Purged organization"}</span> : <span className="text-ink-dim">Platform</span>}</TableCell>
                <TableCell className="max-w-56 text-xs max-xl:hidden">{row.reason ? <span className="line-clamp-2 break-words text-ink" title={row.reason}>{row.reason}</span> : <span className="text-ink-dim">None</span>}</TableCell>
                <TableCell className="whitespace-nowrap text-right text-xs max-lg:hidden">
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-ink-soft" title={sealed ? "Sealed into the hash chain" : "Waiting to be sealed"}>
                    {row.sequence ?? "—"}
                    {sealed ? <ShieldCheck aria-label="Sealed" size={14} className="text-ok" /> : <ShieldQuestion aria-label="Not sealed yet" size={14} className="text-warn" />}
                  </span>
                </TableCell>
              </TableRow>
              {expanded && (
                <tr className="bg-sunken/70">
                  <td colSpan={8} className="px-4 pb-4 pt-3">
                    <dl className="grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
                      <Detail label="Entry ID" mono>{row.id}</Detail>
                      <Detail label="Actor ID" mono>{row.actorId ?? "None (system)"}</Detail>
                      <Detail label="Target" mono>{row.targetType}:{row.targetId}</Detail>
                      <Detail label="Organization" mono>{row.organizationId ? `${row.organizationName ?? "Purged"} (${row.organizationId})` : "Platform"}</Detail>
                      <Detail label="Reason">{row.reason ?? "None recorded"}</Detail>
                      <Detail label="Chain sequence" mono>{row.sequence ?? "Not sealed yet"}</Detail>
                      <Detail label="Entry hash" mono>{row.entryHash ?? "Not sealed yet"}</Detail>
                      <Detail label="Previous hash" mono>{row.previousHash ?? "None"}</Detail>
                    </dl>
                    {hasMetadata(row.metadata) && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-medium text-ink-soft">Metadata</p>
                        <pre className="max-h-64 overflow-auto rounded-control border border-line bg-surface p-3 font-mono text-2xs text-ink-soft">{JSON.stringify(row.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Detail({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-dim">{label}</dt>
      <dd className={cn("mt-0.5 break-all text-ink", mono && "font-mono text-2xs")}>{children}</dd>
    </div>
  );
}
