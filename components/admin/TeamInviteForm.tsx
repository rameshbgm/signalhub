"use client";

import { useActionState } from "react";
import {
  inviteMember,
  reactivateMember,
  regenerateMemberInvite,
  type TeamInviteState,
} from "@/app/admin/(protected)/team/actions";
import { CopyButton } from "@/components/CopyButton";
import { HelpTip } from "@/components/HelpTip";
import { MEMBERSHIP_ROLES } from "@/lib/identity";

const INITIAL_STATE: TeamInviteState = { ok: false };

type PageOption = {
  id: string;
  name: string;
};

function InvitationResult({
  state,
  compact = false,
}: {
  state: TeamInviteState;
  compact?: boolean;
}) {
  if (!state.inviteUrl) return null;
  return (
    <div
      className={
        compact
          ? "w-full min-w-72 border border-[var(--green)]/40 bg-[var(--green-soft)] p-2"
          : "border border-[var(--green)]/40 bg-[var(--green-soft)] p-4"
      }
    >
      <p className="text-sm font-semibold text-[var(--fg)]">
        Invitation link created{state.inviteeName ? ` for ${state.inviteeName}` : ""}
      </p>
      <p className="mt-1 text-xs text-[var(--fg-soft)]">
        Copy this one-time URL now. It expires after 48 hours and is not stored in
        plaintext.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={state.inviteUrl}
          aria-label="Team invitation URL"
          className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--bg)] px-2 py-2 font-mono text-xs text-[var(--fg)]"
        />
        <CopyButton
          value={state.inviteUrl}
          label="Copy link"
          className="border border-[var(--cyan)]/40 px-3 py-2 text-xs font-semibold text-[var(--cyan)]"
        />
      </div>
    </div>
  );
}

export function TeamInviteForm({
  pages = [],
  scopedPageId,
  canGrantOwnership = false,
  className,
}: {
  pages?: PageOption[];
  scopedPageId?: string;
  canGrantOwnership?: boolean;
  className?: string;
}) {
  const [state, action, pending] = useActionState(inviteMember, INITIAL_STATE);
  const roles = MEMBERSHIP_ROLES.filter(
    (role) => canGrantOwnership || role !== "OWNER"
  );

  if (state.ok && state.inviteUrl) {
    return <InvitationResult state={state} />;
  }

  return (
    <form
      action={action}
      className={
        className ??
        "grid gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2 sm:p-5"
      }
    >
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--fg-dim)] sm:col-span-2">
        Invite a member
      </p>
      <input
        name="name"
        placeholder="Full name"
        maxLength={120}
        className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] transition-colors focus:border-[var(--cyan)]"
        required
      />
      <input
        name="email"
        type="email"
        placeholder="Email"
        className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] transition-colors focus:border-[var(--cyan)]"
        required
      />
      <div className="flex items-center gap-1.5 sm:col-span-2">
        <select
          name="role"
          defaultValue="RESPONDER"
          className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--fg)] outline-none transition-colors focus:border-[var(--cyan)]"
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <HelpTip text="Owners and Admins have organization-wide access. Incident Managers, Responders, and Viewers can be limited to selected pages." />
      </div>
      {scopedPageId ? (
        <input type="hidden" name="pageIds" value={scopedPageId} />
      ) : (
        <fieldset className="border border-[var(--line)] p-3 sm:col-span-2">
          <legend className="px-1 text-xs text-[var(--fg-dim)]">
            Page access (leave empty for all pages)
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {pages.map((page) => (
              <label
                key={page.id}
                className="flex items-center gap-2 text-xs text-[var(--fg-soft)]"
              >
                <input type="checkbox" name="pageIds" value={page.id} />{" "}
                {page.name}
              </label>
            ))}
            {pages.length === 0 && (
              <p className="text-xs text-[var(--fg-dim)]">
                No status pages exist yet; this member will receive organization-wide
                page access.
              </p>
            )}
          </div>
        </fieldset>
      )}
      <p className="text-xs text-[var(--fg-dim)] sm:col-span-2">
        The member stays pending until they use the single-use link. New identities
        choose a password; existing password-backed identities confirm theirs.
      </p>
      {state.error && (
        <p role="alert" className="text-xs text-[var(--red)] sm:col-span-2">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="bg-[var(--cyan)] py-2.5 font-mono text-sm font-semibold text-[var(--on-cyan)] transition-opacity hover:opacity-90 disabled:opacity-50 sm:col-span-2"
      >
        {pending ? "Creating invitation…" : "Create invitation link"}
      </button>
    </form>
  );
}

export function TeamInviteRenewForm({
  membershipId,
}: {
  membershipId: string;
}) {
  const actionWithMembership = regenerateMemberInvite.bind(null, membershipId);
  const [state, action, pending] = useActionState(
    actionWithMembership,
    INITIAL_STATE
  );

  if (state.ok && state.inviteUrl) {
    return <InvitationResult state={state} compact />;
  }

  return (
    <form action={action}>
      {state.error && (
        <p role="alert" className="mb-1 max-w-64 text-xs text-[var(--red)]">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="border border-[var(--amber)]/40 px-2.5 py-1 text-xs font-semibold text-[var(--amber)] disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create new link"}
      </button>
    </form>
  );
}

export function TeamMemberReactivationForm({
  membershipId,
}: {
  membershipId: string;
}) {
  const actionWithMembership = reactivateMember.bind(null, membershipId);
  const [state, action, pending] = useActionState(
    actionWithMembership,
    INITIAL_STATE
  );

  if (state.ok && state.inviteUrl) {
    return <InvitationResult state={state} compact />;
  }
  if (state.ok && state.reactivated) {
    return (
      <p
        role="status"
        className="border border-[var(--green)]/40 bg-[var(--green-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--green)]"
      >
        {state.inviteeName ?? "Member"} reactivated
      </p>
    );
  }

  return (
    <form action={action}>
      {state.error && (
        <p role="alert" className="mb-1 max-w-64 text-xs text-[var(--red)]">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="border border-[var(--green)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--green)] disabled:opacity-50"
      >
        {pending ? "Reactivating…" : "Reactivate"}
      </button>
    </form>
  );
}
