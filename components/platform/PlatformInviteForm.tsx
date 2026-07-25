"use client";

import { useActionState } from "react";
import {
  createPlatformInvite,
  type PlatformInviteState,
} from "@/app/platform/(protected)/admins/actions";
import { CopyButton } from "@/components/CopyButton";

const INITIAL: PlatformInviteState = { ok: false };

export function PlatformInviteForm() {
  const [state, action, pending] = useActionState(createPlatformInvite, INITIAL);
  if (state.ok && state.inviteUrl) {
    return (
      <div className="border border-[var(--green)]/40 bg-[var(--green-soft)] p-4">
        <p className="text-sm font-semibold text-[var(--fg)]">Invitation created</p>
        <p className="mt-1 text-xs text-[var(--fg-soft)]">Copy this one-time URL now. It expires after 48 hours.</p>
        <div className="mt-3 flex gap-2">
          <input readOnly value={state.inviteUrl} className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--bg)] px-2 py-2 font-mono text-xs" />
          <CopyButton
            value={state.inviteUrl}
            className="border border-[var(--cyan)]/40 px-3 py-2 text-xs font-semibold text-[var(--cyan)]"
          />
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-[var(--fg)]">Name<input name="name" required maxLength={120} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-normal" /></label>
      <label className="text-xs font-semibold text-[var(--fg)]">Email<input name="email" type="email" required className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-normal" /></label>
      <label className="text-xs font-semibold text-[var(--fg)]">Role<select name="role" defaultValue="OPERATOR" className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-normal"><option>OWNER</option><option>OPERATOR</option><option>AUDITOR</option></select></label>
      <label className="text-xs font-semibold text-[var(--fg)]">Reason<input name="reason" required minLength={10} placeholder="Ticket or rationale" className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm font-normal" /></label>
      {state.error && <p role="alert" className="text-xs text-[var(--red)] sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2"><button disabled={pending} className="bg-[var(--cyan)] px-4 py-2 text-xs font-semibold text-[var(--on-cyan)] disabled:opacity-50">{pending ? "Creating…" : "Create invitation"}</button></div>
    </form>
  );
}
