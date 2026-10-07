"use client";

import { useEffect, type HTMLAttributes, type ReactNode } from "react";

// Open dialogs, newest last: Escape closes only the topmost one when dialogs stack.
const openDialogs: symbol[] = [];

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (event: unknown, data: { open: boolean }) => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const token = Symbol("dialog");
    openDialogs.push(token);
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openDialogs.at(-1) === token) onOpenChange(event, { open: false });
    };
    document.addEventListener("keydown", close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      document.body.style.overflow = previous;
    };
  }, [onOpenChange, open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[2500] grid animate-fade place-items-center bg-ink/40 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onOpenChange(event, { open: false }); }}>{children}</div>;
}

export function DialogSurface({ children, className = "" }: { children: ReactNode; className?: string }) { return <div role="dialog" aria-modal="true" className={`w-full max-w-lg animate-pop rounded-sheet border border-line bg-surface p-6 text-ink shadow-float ${className}`}>{children}</div>; }
export function DialogBody({ children }: { children: ReactNode }) { return <div className="space-y-4">{children}</div>; }
export function DialogTitle({ children }: { children: ReactNode }) { return <h2 className="pr-8 text-lg font-semibold tracking-tight text-ink">{children}</h2>; }
export function DialogContent({ children, className }: HTMLAttributes<HTMLDivElement>) { return <div className={className}>{children}</div>; }
export function DialogActions({ children }: { children: ReactNode }) { return <div className="flex flex-wrap justify-end gap-2 pt-2">{children}</div>; }
