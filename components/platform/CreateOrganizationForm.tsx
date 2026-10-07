"use client";

import { useActionState } from "react";
import { useToast } from "@/components/ui/toast";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createOrganization,
  type CreateOrganizationState,
} from "@/app/platform/(protected)/orgs/actions";
import { INPUT_LIMITS } from "@/lib/input-limits";

const INITIAL_STATE: CreateOrganizationState = { ok: false };

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, INITIAL_STATE);
  useToast("danger", state.error, state);

  if (state.ok) {
    return (
      <Alert tone="ok" title={`${state.organizationName} is ready`}>
        Open it from the organization directory, then create users and assign roles from Users &amp; Roles.
      </Alert>
    );
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Organization name" htmlFor="organization-name" required>
        <Input
          id="organization-name"
          name="name"
          required
          maxLength={120}
        />
      </Field>
      <Field label="Slug" htmlFor="organization-slug" hint="Lowercase letters, numbers, and hyphens. Leave empty to generate it from the name.">
        <Input
          id="organization-slug"
          name="slug"
          maxLength={80}
          placeholder="generated from name"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          className="font-mono"
        />
      </Field>
      <Field label="Provisioning reason" htmlFor="organization-reason" required hint="Recorded in the platform audit log." className="sm:col-span-2">
        <Input
          id="organization-reason"
          name="reason"
          required
          minLength={INPUT_LIMITS.reasonMin}
          maxLength={INPUT_LIMITS.reason}
          placeholder="Customer request or internal ticket"
        />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button
          type="submit"
          disabled={pending}
          loading={pending}
        >
          {!pending && <Plus aria-hidden size={16} />}
          {pending ? "Creating…" : "Create organization"}
        </Button>
      </div>
    </form>
  );
}
