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

  return (
    <PlatformActionForm action={action} successMessage="Page draft created" className="space-y-7">
      <fieldset>
        <legend className="text-sm font-semibold text-[var(--fg)]">What are you creating?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            {
              value: "STATUS" as const,
              title: "Status page",
              description: "Own services, incidents, maintenance, and uptime. Add it to a hub now or later.",
            },
            {
              value: "HUB" as const,
              title: "Hub",
              description: "Summarize several status pages in one directory. A hub never owns services directly.",
            },
          ].map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer border p-4 ${kind === option.value ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line)] bg-[var(--bg)]"}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
                <input
                  type="radio"
                  name="kind"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => setKind(option.value)}
                />
                {option.title}
              </span>
              <span className="mt-2 block text-xs leading-5 text-[var(--fg-dim)]">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
          Page name
          <input
            name="name"
            placeholder={kind === "HUB" ? "Company status hub" : "Customer status"}
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
            required
            maxLength={120}
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
          URL slug
          <input
            name="slug"
            placeholder="Generated from the page name"
            maxLength={80}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            title="Use lowercase letters, numbers, and single hyphens"
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
          />
        </label>
        <div className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
          Visibility
          <FluentSelect
            aria-label="Visibility"
            name="type"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
            className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
          >
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private (password protected)</option>
            <option value="AUDIENCE">Audience-specific (per-user login)</option>
          </FluentSelect>
        </div>
        {visibility === "PRIVATE" && (
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
            Private page password
            <input
              name="password"
              type="password"
              minLength={12}
              placeholder="At least 12 characters"
              className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
              required
            />
          </label>
        )}
        {kind === "STATUS" && hubs.length > 0 && (
          <div className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
            Add to hub <span className="font-normal text-[var(--fg-dim)]">(optional)</span>
            <FluentSelect
              aria-label="Add to hub"
              name="hubParentId"
              defaultValue={initialHubParentId}
              className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] focus:border-[var(--cyan)] focus:outline-none"
            >
              <option value="">Keep as a standalone status page</option>
              {hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
            </FluentSelect>
          </div>
        )}
      </div>

      <aside className="border border-[var(--cyan)]/30 bg-[var(--cyan-soft)] p-4 text-sm text-[var(--fg-soft)]">
        This first save creates a hidden draft. The next screen separates Content, Appearance, Access, Notifications, and Settings so you can finish one area at a time. Nothing is public until you publish it.
      </aside>

      <div className="flex justify-end border-t border-[var(--line)] pt-5">
        <button className="w-full bg-[var(--cyan)] px-6 py-2.5 font-mono text-sm font-semibold text-[var(--on-cyan)] sm:w-auto">
          Create draft and continue
        </button>
      </div>
    </PlatformActionForm>
  );
}
