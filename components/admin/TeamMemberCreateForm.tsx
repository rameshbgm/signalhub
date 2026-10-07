"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Select } from "@/components/ui/select";
import {
  createMember,
  type TeamMemberCreateState,
} from "@/app/admin/(protected)/team/actions";
import { MEMBERSHIP_ROLES } from "@/lib/identity";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { INPUT_LIMITS } from "@/lib/input-limits";

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
    <Card>
      <CardHeader>
        <CardTitle>Create organization user</CardTitle>
        <CardDescription>
          The membership becomes active immediately. New password users must change the temporary password at first sign-in;
          existing identities keep their current password or SSO authentication.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="member-name">
            <Input
              id="member-name"
              name="name"
              maxLength={120}
              placeholder="Full name"
              required
            />
          </Field>
          <Field label="User ID" htmlFor="member-username">
            <Input
              id="member-username"
              name="username"
              minLength={3}
              maxLength={64}
              placeholder="jane.smith"
              autoComplete="off"
              className="font-mono"
              required
            />
          </Field>
          <Field label="Email" htmlFor="member-email">
            <Input
              id="member-email"
              name="email"
              maxLength={INPUT_LIMITS.email}
              type="email"
              placeholder="name@company.com"
              required
            />
          </Field>
          <Field label="Role" htmlFor="member-role" hint="Admins have organization-wide access. Incident Managers, Responders, and Viewers can be limited to selected pages.">
            <Select
              aria-label="Role"
              id="member-role"
              name="role"
              defaultValue="RESPONDER"
              className="w-full"
            >
              {MEMBERSHIP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Temporary password" htmlFor="member-password" className="sm:col-span-2">
            <Input
              id="member-password"
              name="password"
              maxLength={INPUT_LIMITS.password}
              type="password"
              autoComplete="new-password"
              placeholder="Required for a new local identity"
            />
          </Field>
          <fieldset className="rounded-control border border-line p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-medium text-ink-soft">Page access (leave empty for all pages)</legend>
            <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
              {pages.map((page) => (
                <label key={page.id} className="flex items-center gap-2.5 text-sm text-ink-soft">
                  <Checkbox name="pageIds" value={page.id} /> {page.name}
                </label>
              ))}
              {pages.length === 0 && (
                <p className="text-sm text-ink-dim">No status pages exist yet; this user receives organization-wide page access.</p>
              )}
            </div>
          </fieldset>
          {state.error && <Alert tone="danger" className="sm:col-span-2">{state.error}</Alert>}
          {state.ok && (
            <Alert tone="ok" className="sm:col-span-2">
              {state.memberName ?? "User"} is active and can sign in now.
            </Alert>
          )}
          <div className="flex justify-end border-t border-line pt-4 sm:col-span-2">
            <Button type="submit" loading={pending} className="w-full sm:w-auto">
              <UserPlus aria-hidden size={16} />
              {pending ? "Creating user…" : "Create user and assign role"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
