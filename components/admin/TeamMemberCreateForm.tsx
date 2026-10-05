"use client";

import { useActionState } from "react";
import { Select } from "@/components/ui/select";
import {
  createMember,
  type TeamMemberCreateState,
} from "@/app/admin/(protected)/team/actions";
import { HelpTip } from "@/components/HelpTip";
import { MEMBERSHIP_ROLES } from "@/lib/identity";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const INITIAL_STATE: TeamMemberCreateState = { ok: false };

type PageOption = {
  id: string;
  name: string;
};

export function TeamMemberCreateForm({
  pages,
}: {
  pages: PageOption[];
}) {
  const [state, action, pending] = useActionState(createMember, INITIAL_STATE);

  return (
    <form action={action} className="grid gap-4 border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2 sm:p-5">
      <div className="sm:col-span-2">
        <p className="font-mono text-sm font-semibold text-[var(--fg)]">Create organization user</p>
        <p className="mt-1 text-xs leading-5 text-[var(--fg-dim)]">
          The membership becomes active immediately. New password users must change the temporary password at first sign-in;
          existing identities keep their current password or SSO authentication.
        </p>
      </div>
      <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
        Full name
        <Input
          name="name"
          maxLength={120}
          placeholder="Full name"
          className="font-normal"
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
        User ID
        <Input
          name="username"
          minLength={3}
          maxLength={64}
          placeholder="jane.smith"
          autoComplete="off"
          className="font-normal"
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
        Email
        <Input
          name="email"
          type="email"
          placeholder="name@company.com"
          className="font-normal"
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)] sm:col-span-2">
        Temporary password
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Required for a new local identity"
          className="font-normal"
        />
      </label>
      <div className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
        Role
        <span className="flex items-center gap-1.5">
          <Select
            aria-label="Role"
            name="role"
            defaultValue="RESPONDER"
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
          >
            {MEMBERSHIP_ROLES.map((role) => (
              <option key={role} value={role}>
                {role.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
          <HelpTip text="Admins have organization-wide access. Incident Managers, Responders, and Viewers can be limited to selected pages." />
        </span>
      </div>
      <fieldset className="border border-[var(--line)] p-3 sm:col-span-2">
        <legend className="px-1 text-xs text-[var(--fg-dim)]">Page access (leave empty for all pages)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {pages.map((page) => (
            <label key={page.id} className="flex items-center gap-2 text-xs text-[var(--fg-soft)]">
              <Checkbox name="pageIds" value={page.id} /> {page.name}
            </label>
          ))}
          {pages.length === 0 && (
            <p className="text-xs text-[var(--fg-dim)]">No status pages exist yet; this user receives organization-wide page access.</p>
          )}
        </div>
      </fieldset>
      {state.error && <p role="alert" className="text-xs text-[var(--red)] sm:col-span-2">{state.error}</p>}
      {state.ok && (
        <p role="status" className="border border-[var(--green)]/30 bg-[var(--green-soft)] p-3 text-xs text-[var(--green)] sm:col-span-2">
          {state.memberName ?? "User"} is active and can sign in now.
        </p>
      )}
      <div className="flex justify-end border-t border-[var(--line)] pt-4 sm:col-span-2">
        <Button type="submit" loading={pending} className="w-full font-mono sm:w-auto">
          {pending ? "Creating user…" : "Create user and assign role"}
        </Button>
      </div>
    </form>
  );
}
