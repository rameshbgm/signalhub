"use client";

import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConfirmOptions = { title?: string; confirmLabel?: string };
type Request = ConfirmOptions & { message: string; resolve: (confirmed: boolean) => void };

/**
 * In-app replacement for window.confirm: `await confirm(message)` opens a compact dialog with the message and resolves true only on the confirm button. Render the returned element anywhere.
 */
export function useConfirm(): [(message: string, options?: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [request, setRequest] = useState<Request | null>(null);
  const confirm = useCallback(
    (message: string, options: ConfirmOptions = {}) => new Promise<boolean>((resolve) => setRequest({ message, resolve, ...options })),
    []
  );
  const close = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
  };
  const dialog = request && createPortal(
    <Dialog open onOpenChange={() => close(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" className="w-full max-w-sm animate-pop rounded-sheet border border-line bg-surface p-4 text-ink shadow-float sm:p-5">
        <div className="flex items-start gap-3">
          <HelpCircle aria-hidden size={22} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold tracking-tight">{request.title ?? "Are you sure?"}</h2>
            <p id="confirm-message" className="mt-1.5 break-words text-sm leading-6 text-ink-soft">{request.message}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => close(false)} autoFocus>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => close(true)}>{request.confirmLabel ?? "Confirm"}</Button>
        </div>
      </div>
    </Dialog>,
    document.body
  );
  return [confirm, dialog];
}
