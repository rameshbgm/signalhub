"use client";

import { useEffect, type HTMLAttributes, type ReactNode } from "react";

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (event: unknown, data: { open: boolean }) => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(event, { open: false }); };
    document.addEventListener("keydown", close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = previous; };
  }, [onOpenChange, open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[2500] grid animate-fade place-items-center bg-ink/30 p-4 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onOpenChange(event, { open: false }); }}>{children}</div>;
}

export function DialogSurface({ children }: { children: ReactNode }) { return <div role="dialog" aria-modal="true" className="w-full max-w-lg animate-pop rounded-sheet bg-surface p-7 ring-1 ring-line text-ink shadow-float">{children}</div>; }
export function DialogBody({ children }: { children: ReactNode }) { return <div className="space-y-4">{children}</div>; }
export function DialogTitle({ children }: { children: ReactNode }) { return <h2 className="pr-8 text-xl font-extrabold tracking-tight text-ink">{children}</h2>; }
export function DialogContent({ children, className }: HTMLAttributes<HTMLDivElement>) { return <div className={className}>{children}</div>; }
export function DialogActions({ children }: { children: ReactNode }) { return <div className="flex flex-wrap justify-end gap-2 pt-2">{children}</div>; }
