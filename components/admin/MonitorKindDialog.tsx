"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import { Dialog, DialogSurface } from "@/components/ui/dialog";
import { AFTER_EVERY_CHECK, type MonitorKindInfo } from "@/lib/monitor-kinds";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-dim">{title}</h3>
      {children}
    </section>
  );
}

function Bullets({ items, as: List = "ul" }: { items: string[]; as?: ElementType }) {
  return <List className={`space-y-1.5 pl-5 ${List === "ol" ? "list-decimal" : "list-disc"}`}>{items.map((line) => <li key={line}>{line}</li>)}</List>;
}

function Terms({ items }: { items: { name: string; text: string }[] }) {
  return (
    <dl className="divide-y divide-line/70 rounded-control border border-line/70">
      {items.map((item) => (
        <div key={item.name} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[13rem_1fr] sm:gap-3">
          <dt className="font-semibold text-ink">{item.name}</dt>
          <dd>{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Full guide for one kind of monitor, in a centered dialog. Escape, the close button and a click outside all close it. */
export function MonitorKindDialog({ info, icon: Icon, onClose }: { info: MonitorKindInfo | null; icon: LucideIcon; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (info) closeRef.current?.focus(); }, [info]);
  // Portaled out of the form: an ancestor with a transform would otherwise become the containing block of the fixed overlay and push the dialog off-center.
  if (!info) return null;
  return createPortal(
    <Dialog open onOpenChange={onClose}>
      <DialogSurface className="flex max-h-[88dvh] max-w-3xl! flex-col overflow-hidden">
        <header className="-mx-6 -mt-6 flex items-start gap-3 border-b border-line bg-primary-soft/50 px-6 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface text-primary-ink shadow-sm"><Icon aria-hidden size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="kind-dialog-title" className="text-lg font-semibold tracking-tight text-ink">{info.title}</h2>
            <p className="mt-0.5 text-sm text-ink-soft">{info.description}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-control text-ink-dim outline-none hover:bg-sunken hover:text-ink focus-visible:ring-4 focus-visible:ring-primary/25">
            <X aria-hidden size={18} />
          </button>
        </header>
        <div className="-mx-6 flex-1 space-y-6 overflow-y-auto px-6 py-5 text-sm leading-6 text-ink-soft">
          <p className="text-ink">{info.overview}</p>
          <Section title="When to use it"><Bullets items={info.whenToUse} /></Section>
          <Section title="How to set it up"><Bullets items={info.howToUse} as="ol" /></Section>
          <Section title="Settings explained"><Terms items={info.settings} /></Section>
          <Section title="Examples"><Bullets items={info.examples} /></Section>
          <Section title="Good to know"><Bullets items={info.goodToKnow} /></Section>
          <Section title="Troubleshooting">
            <Terms items={info.troubleshooting.map((row) => ({ name: row.problem, text: row.fix }))} />
          </Section>
          <Section title="After every check"><Terms items={AFTER_EVERY_CHECK} /></Section>
        </div>
        <footer className="-mx-6 -mb-6 flex justify-end border-t border-line px-6 py-3">
          <button type="button" onClick={onClose} className="rounded-control px-3 py-1.5 text-sm font-semibold text-primary-ink outline-none hover:bg-primary-soft focus-visible:ring-4 focus-visible:ring-primary/25">Close</button>
        </footer>
      </DialogSurface>
    </Dialog>,
    document.body,
  );
}
