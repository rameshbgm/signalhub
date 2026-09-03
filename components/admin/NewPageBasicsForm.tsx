"use client";

import { useState } from "react";
import { FluentSelect } from "@/components/FluentSelect";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";

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
    <PlatformActionForm action={action} successMessage="Page draft created" className="space-y-6">
      <div className="grid gap-2">
        <label htmlFor="page-name" className="text-sm font-semibold text-[var(--fg)]">Page name</label>
        <input id="page-name" name="name" placeholder="e.g. Customer status" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-3 text-base font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" required maxLength={120} autoFocus />
        <p className="text-sm leading-6 text-[var(--fg-dim)]">Start with a private draft. Add services and publish when it is ready.</p>
      </div>

      <details className="border-y border-[var(--line)] py-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--fg)]">More options</summary>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">Page type
            <FluentSelect aria-label="Page type" name="kind" value={kind} onChange={(event) => setKind(event.target.value as "STATUS" | "HUB")} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
              {kindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </FluentSelect>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">Visibility
            <FluentSelect aria-label="Visibility" name="type" value={visibility} onChange={(event) => setVisibility(event.target.value)} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none">
              <option value="PUBLIC">Public</option><option value="PRIVATE">Private (password protected)</option><option value="AUDIENCE">Audience-specific (per-user login)</option>
            </FluentSelect>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">URL slug <span className="font-normal text-[var(--fg-dim)]">(optional)</span><input name="slug" placeholder="Generated from the page name" maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use lowercase letters, numbers, and single hyphens" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" /></label>
          {visibility === "PRIVATE" && <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">Private page password<input name="password" type="password" minLength={12} placeholder="At least 12 characters" className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" required /></label>}
          {kind === "STATUS" && hubs.length > 0 && <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">Add to hub <span className="font-normal text-[var(--fg-dim)]">(optional)</span>
            <FluentSelect aria-label="Add to hub" name="hubParentId" defaultValue={initialHubParentId} className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"><option value="">Keep as a standalone status page</option>{hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</FluentSelect>
          </label>}
        </div>
      </details>

      <div className="flex items-center justify-between gap-4"><p className="text-xs text-[var(--fg-dim)]">You can change these settings later.</p><button className="shrink-0 bg-[var(--cyan)] px-6 py-2.5 font-mono text-sm font-semibold text-[var(--on-cyan)]">Create draft</button></div>
    </PlatformActionForm>
  );
}
