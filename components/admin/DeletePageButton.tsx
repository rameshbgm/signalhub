"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Button } from "@/components/ui/button";
import { CopyPhrase } from "@/components/ui/copy-phrase";
import { Dialog, DialogActions, DialogSurface, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Trash icon that opens a type-the-name dialog and deletes the page in place (deletePage bound to the page id on the server). */
export function DeletePageButton({ name, action, className }: { name: string; action: (formData: FormData) => Promise<string | void>; className?: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const close = useCallback(() => { setOpen(false); setConfirmation(""); }, []);
  return (
    <>
      <Button type="button" variant="ghost" size="icon" data-button-guard="off" className={className} aria-label={`Delete ${name}`} title="Delete page" onClick={() => setOpen(true)}><Trash2 aria-hidden size={16} /></Button>
      {open && createPortal(
        <Dialog open onOpenChange={close}>
          <DialogSurface>
            <DialogTitle>Delete {name} permanently?</DialogTitle>
            <PlatformActionForm action={action} successMessage="Page deleted" onSuccess={close} className="mt-3 space-y-4">
              <p className="text-sm leading-6 text-ink-soft">Deletes the page with its services, incidents, subscribers, metrics, monitors and assets. This cannot be undone.</p>
              <label className="block space-y-1.5 text-sm text-ink-soft">
                <span>Type <CopyPhrase text={name} /> to confirm</span>
                <Input name="confirmation" autoComplete="off" required autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
              <DialogActions>
                <Button type="button" variant="secondary" data-button-guard="off" onClick={close}>Cancel</Button>
                <Button type="submit" variant="destructive" disabled={confirmation.trim() !== name}>Delete permanently</Button>
              </DialogActions>
            </PlatformActionForm>
          </DialogSurface>
        </Dialog>,
        document.body,
      )}
    </>
  );
}
