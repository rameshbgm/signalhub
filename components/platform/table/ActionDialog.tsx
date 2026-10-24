"use client";

import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogSurface } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_LIMITS } from "@/lib/input-limits";
import { cn } from "@/lib/utils";

export type DialogRequest = {
  title: string;
  /** What will happen, in plain words. Shown in a warning box for destructive actions. */
  warning: ReactNode;
  tone: "danger" | "warn" | "info";
  confirmLabel: string;
  /** Names of what is affected, shown as a short list. */
  subjects: string[];
  /** Ask for the audit reason (user actions require one). */
  askReason?: boolean;
  /** The words the operator must type before a destructive action is allowed, such as an organization slug. */
  confirmText?: string;
  /** Return an error message to keep the dialog open, nothing to close it. */
  run: (reason: string, typed: string) => Promise<string | void>;
};

const SHOWN = 5;

/** One confirmation for every row and bulk action: what will happen, to whom, why, and the result. */
export function ActionDialog({ request, onClose }: { request: DialogRequest | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const [seen, setSeen] = useState(request);
  if (seen !== request) { setSeen(request); setReason(""); setTyped(""); setError(""); setBusy(false); }
  if (!request) return null;
  const tooShort = (request.askReason && reason.trim().length < 10) || (request.confirmText !== undefined && typed !== request.confirmText);
  const more = request.subjects.length - SHOWN;

  async function confirm() {
    if (!request || tooShort || busy) return;
    setBusy(true);
    setError("");
    const message = await request.run(reason.trim(), typed).catch(() => "The operation could not be completed. Reload and try again.");
    if (message) { setError(message); setBusy(false); } else onClose();
  }

  return (
    <Dialog open onOpenChange={() => { if (!busy) onClose(); }}>
      <DialogSurface className="max-w-md">
        <form onSubmit={(event) => { event.preventDefault(); void confirm(); }} aria-labelledby={`${id}-title`} className="space-y-4">
          <div className="flex items-start gap-3">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", request.tone === "danger" ? "bg-danger-bg text-danger-fg" : request.tone === "warn" ? "bg-warn-bg text-warn-fg" : "bg-info-bg text-info-fg")}>
              {request.tone === "info" ? <Info aria-hidden size={20} /> : <AlertTriangle aria-hidden size={20} />}
            </span>
            <div className="min-w-0">
              <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight text-ink">{request.title}</h2>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-soft">
                {request.subjects.slice(0, SHOWN).map((subject) => <li key={subject} className="break-all font-medium text-ink">{subject}</li>)}
                {more > 0 && <li>and {more} more</li>}
              </ul>
            </div>
          </div>
          <Alert tone={request.tone === "info" ? "info" : request.tone}>{request.warning}</Alert>
          {request.askReason && (
            <Field label="Reason for the audit log" htmlFor={`${id}-reason`} required hint="At least 10 characters, for example a ticket number and why.">
              <Textarea id={`${id}-reason`} rows={2} className="min-h-0" value={reason} maxLength={INPUT_LIMITS.reason} autoFocus onChange={(event) => setReason(event.target.value)} placeholder="Ticket or reason" />
            </Field>
          )}
          {request.confirmText !== undefined && (
            <Field label={<>Type <code className="rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">{request.confirmText}</code> to confirm</>} htmlFor={`${id}-confirm`} required>
              <Input id={`${id}-confirm`} value={typed} autoFocus autoComplete="off" spellCheck={false} className="font-mono" onChange={(event) => setTyped(event.target.value)} placeholder={request.confirmText} />
            </Field>
          )}
          {error && <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">{error}</p>}
          <DialogActions>
            <Button data-button-busy-mode="interaction" type="button" variant="secondary" onClick={onClose} disabled={busy} autoFocus={!request.askReason && request.confirmText === undefined}>Cancel</Button>
            <Button data-button-busy-mode="interaction" type="submit" variant={request.tone === "danger" ? "destructive" : "default"} loading={busy} disabled={Boolean(tooShort)}>{request.confirmLabel}</Button>
          </DialogActions>
        </form>
      </DialogSurface>
    </Dialog>
  );
}
