"use client";

import { useEffect, useState } from "react";

type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

type Change = { field: string; before: unknown; after: unknown };

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function AuditLogList({ logs }: { logs: AuditEntry[] }) {
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected]);

  return (
    <>
      <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--surface)]">
        {logs.map((entry) => (
          <button key={entry.id} type="button" data-button-guard="off" onClick={() => setSelected(entry)} className="flex w-full flex-col gap-1 p-3 text-left text-sm transition-colors hover:bg-[var(--hover-overlay)] sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[var(--fg)]">
              <span className="font-medium">{entry.actor}</span> {entry.action.toLowerCase().replaceAll("_", " ")}{" "}
              <code className="bg-[var(--bg)] px-1 text-xs text-[var(--fg-soft)]">{entry.target}</code>
              <span className="ml-2 text-xs font-semibold text-[var(--cyan)]">View changes</span>
            </span>
            <span className="text-xs text-[var(--fg-dim)]">{new Date(entry.createdAt).toLocaleString()}</span>
          </button>
        ))}
        {logs.length === 0 && <p className="p-3 text-sm text-[var(--fg-dim)]">No activity in the last six months.</p>}
      </div>
      {selected && <AuditDetails entry={selected} close={() => setSelected(null)} />}
    </>
  );
}

function AuditDetails({ entry, close }: { entry: AuditEntry; close: () => void }) {
  const changes = Array.isArray(entry.metadata?.changes)
    ? entry.metadata.changes.filter((item): item is Change => Boolean(item && typeof item === "object" && "field" in item))
    : [];
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="max-h-[85vh] w-full max-w-3xl overflow-y-auto border border-[var(--line-bright)] bg-[var(--surface)] shadow-2xl">
        <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--cyan)]">Audit comparison</p>
            <h2 id="audit-detail-title" className="mt-1 font-mono text-lg font-semibold text-[var(--fg)]">{entry.action.replaceAll("_", " ")}</h2>
            <p className="mt-1 text-xs text-[var(--fg-dim)]">{entry.actor} · {new Date(entry.createdAt).toLocaleString()}</p>
          </div>
          <button type="button" data-button-guard="off" onClick={close} aria-label="Close" className="h-9 w-9 border border-[var(--line)] text-xl text-[var(--fg-soft)]">×</button>
        </header>
        <div className="space-y-4 p-5">
          <p className="text-sm text-[var(--fg-soft)]">Target: <code className="bg-[var(--bg)] px-1 text-xs">{entry.target}</code></p>
          {changes.length > 0 ? (
            <div className="overflow-x-auto border border-[var(--line)]">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-[var(--surface-raised)] font-mono text-xs text-[var(--fg-soft)]"><tr><th className="p-3">Field</th><th className="p-3">Before</th><th className="p-3">After</th></tr></thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {changes.map((change, index) => <tr key={`${change.field}-${index}`}><th className="p-3 align-top font-medium text-[var(--fg)]">{change.field}</th><td className="whitespace-pre-wrap p-3 align-top text-[var(--red)]">{valueText(change.before)}</td><td className="whitespace-pre-wrap p-3 align-top text-[var(--green)]">{valueText(change.after)}</td></tr>)}
                </tbody>
              </table>
            </div>
          ) : entry.metadata && Object.keys(entry.metadata).length > 0 ? (
            <pre className="overflow-x-auto border border-[var(--line)] bg-[var(--bg)] p-4 text-xs text-[var(--fg-soft)]">{JSON.stringify(entry.metadata, null, 2)}</pre>
          ) : (
            <p className="border border-dashed border-[var(--line)] p-4 text-sm text-[var(--fg-dim)]">This older audit entry does not contain field-level comparison data.</p>
          )}
        </div>
      </section>
    </div>
  );
}
