"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConfirmOptions = { title?: string; confirmLabel?: string };
type Request = ConfirmOptions & { message: string; anchor: HTMLElement | null; resolve: (confirmed: boolean) => void };

const GAP = 10;
const MARGIN = 8;
const TRIGGER_WINDOW_MS = 3000;

// The button that started the confirmation: confirm() usually runs after an await, and Safari does not focus
// clicked buttons, so remember the last pointer/keyboard activation instead of relying on document.activeElement.
let lastTrigger: { el: HTMLElement; at: number } | null = null;
if (typeof document !== "undefined") {
  const remember = (el: Element | null) => {
    const target = el?.closest<HTMLElement>("button, a, [role=button]");
    if (target) lastTrigger = { el: target, at: Date.now() };
  };
  document.addEventListener("pointerdown", (event) => remember(event.target as Element), true);
  document.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") remember(document.activeElement); }, true);
}

function findAnchor() {
  if (lastTrigger?.el.isConnected && Date.now() - lastTrigger.at < TRIGGER_WINDOW_MS) return lastTrigger.el;
  const active = document.activeElement;
  return active instanceof HTMLElement && active.matches("button, a, [role=button]") ? active : null;
}

function Content({ request, close }: { request: Request; close: (confirmed: boolean) => void }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <HelpCircle aria-hidden size={22} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0">
          <h2 id="confirm-title" className="text-base font-semibold tracking-tight">{request.title ?? "Are you sure?"}</h2>
          <p id="confirm-message" className="mt-1.5 break-words text-sm leading-6 text-ink-soft">{request.message}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => close(false)} autoFocus>Cancel</Button>
        <Button type="button" variant="destructive" onClick={() => close(true)}>{request.confirmLabel ?? "Confirm"}</Button>
      </div>
    </>
  );
}

const surface = "rounded-sheet border border-line bg-surface p-4 text-ink shadow-float sm:p-5";

/** Small popover with an arrow pointing at the trigger; follows it on scroll/resize and flips above/below. */
function Popover({ request, close }: { request: Request; close: (confirmed: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ style: CSSProperties; arrowLeft: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    const anchor = request.anchor!;
    const update = () => {
      const box = ref.current;
      if (!box) return;
      const a = anchor.getBoundingClientRect();
      const { offsetWidth: w, offsetHeight: h } = box;
      const below = a.top - h - GAP < MARGIN && window.innerHeight - a.bottom > h + GAP;
      const left = Math.min(Math.max(a.left + a.width / 2 - w / 2, MARGIN), window.innerWidth - w - MARGIN);
      const top = below ? a.bottom + GAP : a.top - h - GAP;
      setPlace({ style: { left, top }, arrowLeft: Math.min(Math.max(a.left + a.width / 2 - left, 16), w - 16), below });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [request.anchor]);

  useLayoutEffect(() => {
    // Capture phase + stopPropagation: Escape must close only this popover, not a dialog/drawer underneath it.
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="fixed inset-0 z-[2500]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(false); }}>
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        style={place?.style ?? { visibility: "hidden" }}
        className={`${surface} fixed w-[min(22rem,calc(100vw-1rem))] animate-pop`}
      >
        <Content request={request} close={close} />
        {place && (
          <span
            aria-hidden
            style={{ left: place.arrowLeft }}
            className={`absolute size-3 -translate-x-1/2 rotate-45 border-line bg-surface ${place.below ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-b border-r"}`}
          />
        )}
      </div>
    </div>
  );
}

/**
 * In-app replacement for window.confirm: `await confirm(message)` opens a compact popover anchored to the button
 * that triggered it (a centered dialog on small screens or when no trigger is known) and resolves true only on the
 * confirm button. Render the returned element anywhere.
 */
export function useConfirm(): [(message: string, options?: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = useCallback(
    (message: string, options: ConfirmOptions = {}) => new Promise<boolean>((resolve) => setRequest({ message, resolve, anchor: findAnchor(), ...options })),
    []
  );
  const close = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
  };
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
  const dialog = request && createPortal(
    request.anchor && !compact ? <Popover request={request} close={close} /> : (
      <Dialog open onOpenChange={() => close(false)}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className={`${surface} w-full max-w-sm animate-pop`}>
          <Content request={request} close={close} />
        </div>
      </Dialog>
    ),
    document.body
  );
  return [confirm, dialog];
}
