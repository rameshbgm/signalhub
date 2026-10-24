"use client";

import { useActionState } from "react";
import { useToast } from "@/components/ui/toast";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createOrganization,
  type CreateOrganizationState,
} from "@/app/platform/(protected)/orgs/actions";

const INITIAL_STATE: CreateOrganizationState = { ok: false };

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, INITIAL_STATE);
  useToast("danger", state.error, state);
  useToast("ok", state.ok ? `${state.organizationName} is ready` : null, state);

  if (state.ok) {
    return (
      <Alert tone="ok" title={`${state.organizationName} is ready`}>
        Open it from the tenant directory, then add people on the Teams tab of User management.
      </Alert>
    );
  }

  return (
    <form action={action} className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
      <Field label="Organization name" htmlFor="organization-name" required>
        <Input id="organization-name" name="name" required maxLength={120} />
      </Field>
      <Field label="Slug" htmlFor="organization-slug">
        <Input
          id="organization-slug"
          name="slug"
          maxLength={80}
          placeholder="generated from name"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          aria-describedby="organization-slug-hint"
          className="font-mono"
        />
      </Field>
      <Button type="submit" disabled={pending} loading={pending}>
        {pending ? "Creating…" : "Create organization"}
      </Button>
      <p id="organization-slug-hint" className="text-xs leading-5 text-ink-dim sm:col-span-3">
        The slug uses lowercase letters, numbers and hyphens. Leave it empty to generate it from the name.
      </p>
    </form>
  );
}
