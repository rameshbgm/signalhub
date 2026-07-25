"use client";

import { useActionState } from "react";
import {
  createOrganization,
  type CreateOrganizationState,
} from "@/app/platform/(protected)/orgs/actions";
import { CopyButton } from "@/components/CopyButton";

const INITIAL_STATE: CreateOrganizationState = { ok: false };

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, INITIAL_STATE);

  if (state.ok && state.inviteUrl) {
    return (
      <div className="border border-[var(--green)]/40 bg-[var(--green-soft)] p-4">
        <h3 className="font-mono text-sm font-semibold text-[var(--fg)]">
          {state.organizationName} is ready
        </h3>
        <p className="mt-1 text-xs text-[var(--fg-soft)]">
          Send this one-time owner invitation within 48 hours. It is not stored in plaintext.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={state.inviteUrl}
            aria-label="Owner invitation URL"
            className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--fg)]"
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

  return (
    <form action={action} className="grid gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2">
      <div>
        <label htmlFor="organization-name" className="text-xs font-semibold text-[var(--fg)]">
          Organization name
        </label>
        <input
          id="organization-name"
          name="name"
          required
          maxLength={120}
          className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="organization-slug" className="text-xs font-semibold text-[var(--fg)]">
          Slug
        </label>
        <input
          id="organization-slug"
          name="slug"
          maxLength={80}
          placeholder="generated from name"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-sm"
        />
      </div>
      <div>
        <label htmlFor="owner-name" className="text-xs font-semibold text-[var(--fg)]">
          Owner name
        </label>
        <input
          id="owner-name"
          name="ownerName"
          required
          maxLength={120}
          className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="owner-email" className="text-xs font-semibold text-[var(--fg)]">
          Owner email
        </label>
        <input
          id="owner-email"
          name="ownerEmail"
          type="email"
          required
          className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="organization-reason" className="text-xs font-semibold text-[var(--fg)]">
          Provisioning reason
        </label>
        <input
          id="organization-reason"
          name="reason"
          required
          minLength={10}
          maxLength={500}
          placeholder="Customer request or internal ticket"
          className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-[var(--red)] sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button
          disabled={pending}
          className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create organization"}
        </button>
      </div>
    </form>
  );
}
