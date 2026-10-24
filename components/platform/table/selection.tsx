"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";

/** Row selection for one page of a table; it resets whenever a different set of rows is shown. */
export function useSelection(ids: readonly string[]) {
  const key = ids.join("|");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [seen, setSeen] = useState(key);
  if (seen !== key) { setSeen(key); setSelected(new Set()); }
  return {
    selected,
    has: (id: string) => selected.has(id),
    toggle: (id: string) => setSelected((previous) => { const next = new Set(previous); if (!next.delete(id)) next.add(id); return next; }),
    setAll: (on: boolean) => setSelected(on ? new Set(ids) : new Set()),
    clear: () => setSelected(new Set()),
  };
}

/** The header checkbox: checked when every selectable row is, "mixed" when some are. */
export function SelectAll({ total, count, onChange, label }: { total: number; count: number; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && count < total; }, [count, total]);
  return <Checkbox ref={ref as never} aria-label={label} disabled={total === 0} checked={total > 0 && count === total} onChange={(event) => onChange(event.target.checked)} />;
}

/** Appears above the table while rows are selected; `children` are the bulk buttons. */
export function BulkBar({ count, noun, onClear, children }: { count: number; noun: string; onClear: () => void; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary-soft px-4 py-2.5 animate-rise">
      <p className="text-sm font-semibold text-primary-ink" aria-live="polite">{count} {noun}{count === 1 ? "" : "s"} selected</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <button type="button" onClick={onClear} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-primary-ink outline-none hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-primary/30">
        <X aria-hidden size={13} /> Clear selection
      </button>
    </div>
  );
}

/** Turns a bulk result into one message: toast for the successes, text for the dialog when nothing worked. */
export function reportBatch(verb: string, result: { done: number; failed: Array<{ id: string; message: string }> }, nameOf: (id: string) => string): string | void {
  const reasons = [...new Set(result.failed.map((item) => item.message))].slice(0, 2).join("; ");
  if (result.failed.length === 0) { toast(`${verb} ${result.done} ${result.done === 1 ? "item" : "items"}.`, "ok"); return; }
  const first = nameOf(result.failed[0].id);
  const detail = `${result.failed.length === 1 ? first : `${result.failed.length} items`} could not be changed: ${reasons}.`;
  if (result.done === 0) return detail;
  toast(`${verb} ${result.done}. ${detail}`, "warn");
}
