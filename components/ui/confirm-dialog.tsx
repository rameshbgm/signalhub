"use client";

import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogSurface, DialogTitle } from "@/components/ui/dialog";

type ConfirmOptions = { title?: string; confirmLabel?: string };
type Request = ConfirmOptions & { message: string; resolve: (confirmed: boolean) => void };

/**
 * In-app replacement for window.confirm: `await confirm(message)` opens a modal with the message as an
 * inline warning and resolves true only on the confirm button. Render the returned element anywhere.
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
      <DialogSurface>
        <DialogTitle>{request.title ?? "Are you sure?"}</DialogTitle>
        <Alert tone="warn" className="my-4">{request.message}</Alert>
        <DialogActions>
          <Button type="button" variant="secondary" onClick={() => close(false)} autoFocus>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => close(true)}>{request.confirmLabel ?? "Confirm"}</Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>,
    document.body
  );
  return [confirm, dialog];
}
