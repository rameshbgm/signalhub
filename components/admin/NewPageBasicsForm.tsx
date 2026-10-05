"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { formMessage } from "@/components/admin/page-management-styles";

type HubOption = { id: string; name: string };

export function NewPageBasicsForm({
  action,
  hubs,
  initialHubParentId = "",
}: {
  action: (formData: FormData) => void | Promise<void>;
  hubs: HubOption[];
  initialHubParentId?: string;
}) {
  const [kind, setKind] = useState<"STATUS" | "HUB">("STATUS");
  const [visibility, setVisibility] = useState("PUBLIC");
  const kindOptions = [
    { value: "STATUS" as const, label: "Status page" },
    { value: "HUB" as const, label: "Status hub" },
  ];

  return (
    <PlatformActionForm action={action} successMessage="Page draft created" className="grid gap-4" messageClassName={formMessage}>
      <Field label={<span className="text-base font-semibold text-ink">Page name</span>} htmlFor="page-name" hint="A draft is visible only to your team until you publish it." required>
        <Input id="page-name" name="name" placeholder="e.g. Customer status" className="h-12 text-base!" required maxLength={120} autoFocus />
      </Field>

      <details className="group rounded-card bg-sunken/40 open:bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-card px-4 py-3.5 text-sm font-semibold text-ink outline-none focus-visible:ring-4 focus-visible:ring-primary/25 [&::-webkit-details-marker]:hidden">
          <IconTile icon={SlidersHorizontal} hue="slate" size="sm" />
          <span className="flex-1">Additional options</span>
          <span className="text-xs font-normal text-ink-dim">Optional</span>
          <ChevronDown aria-hidden size={16} className="shrink-0 text-ink-dim transition-transform duration-200 ease-soft group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Page type" htmlFor="page-kind">
            <Select id="page-kind" aria-label="Page type" name="kind" value={kind} onChange={(event) => setKind(event.target.value as "STATUS" | "HUB")} className="w-full">
              {kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
          <Field label="Visibility" htmlFor="page-visibility">
            <Select id="page-visibility" aria-label="Visibility" name="type" value={visibility} onChange={(event) => setVisibility(event.target.value)} className="w-full">
              <option value="PUBLIC">Public</option><option value="PRIVATE">Private (password protected)</option><option value="AUDIENCE">Audience-specific (per-user login)</option>
            </Select>
          </Field>
          <Field label={<>URL slug <span className="font-normal text-ink-dim">(optional)</span></>} htmlFor="page-slug">
            <Input id="page-slug" name="slug" placeholder="Generated from the page name" maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use lowercase letters, numbers, and single hyphens" className="font-mono" />
          </Field>
          {visibility === "PRIVATE" && (
            <Field label="Private page password" htmlFor="page-password" required>
              <Input id="page-password" name="password" type="password" minLength={12} placeholder="At least 12 characters" required />
            </Field>
          )}
          {kind === "STATUS" && hubs.length > 0 && (
            <Field label={<>Add to hub <span className="font-normal text-ink-dim">(optional)</span></>} htmlFor="page-hub">
              <Select id="page-hub" aria-label="Add to hub" name="hubParentId" defaultValue={initialHubParentId} className="w-full">
                <option value="">Keep as a standalone status page</option>
                {hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </details>

      <div className="mt-2 flex flex-col-reverse gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-ink-dim">You can change these settings at any time.</p>
        <Button type="submit" size="lg" className="w-full shrink-0 sm:w-auto">Create draft</Button>
      </div>
    </PlatformActionForm>
  );
}
