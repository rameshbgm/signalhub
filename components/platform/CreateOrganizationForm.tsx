"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createOrganization,
  type CreateOrganizationState,
} from "@/app/platform/(protected)/orgs/actions";

const INITIAL_STATE: CreateOrganizationState = { ok: false };

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, INITIAL_STATE);

  if (state.ok) {
    return (
      <div className="border border-[var(--green)]/40 bg-[var(--green-soft)] p-4">
        <h3 className="font-mono text-sm font-semibold text-[var(--fg)]">
          {state.organizationName} is ready
        </h3>
        <p className="mt-1 text-xs text-[var(--fg-soft)]">
          Open it from the organization directory, then create users and assign roles from Users &amp; Roles.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 sm:grid-cols-2">
      <div>
        <label htmlFor="organization-name" className="text-xs font-semibold text-[var(--fg)]">
          Organization name
        </label>
        <Input
          id="organization-name"
          name="name"
          required
          maxLength={120}
          className="mt-1"
        />
      </div>
      <div>
        <label htmlFor="organization-slug" className="text-xs font-semibold text-[var(--fg)]">
          Slug
        </label>
        <Input
          id="organization-slug"
          name="slug"
          maxLength={80}
          placeholder="generated from name"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          className="mt-1 font-mono"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="organization-reason" className="text-xs font-semibold text-[var(--fg)]">
          Provisioning reason
        </label>
        <Input
          id="organization-reason"
          name="reason"
          required
          minLength={10}
          maxLength={500}
          placeholder="Customer request or internal ticket"
          className="mt-1"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-[var(--red)] sm:col-span-2">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button
          type="submit"
          disabled={pending}
          loading={pending}
        >
          {pending ? "Creating…" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}
