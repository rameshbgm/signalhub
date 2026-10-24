"use client";

import { useState } from "react";
import { BellOff, Save } from "lucide-react";
import { PageSubmitButton } from "@/components/admin/PageSubmitButton";
import { InlineActionForm } from "@/components/InlineActionForm";
import { Checkbox } from "@/components/ui/checkbox";

type Service = { id: string; name: string };

/**
 * Visitor preferences for one subscription: follow every service or only
 * chosen ones, or unsubscribe entirely. Both actions are server actions bound
 * to the subscription's private token.
 */
export function SubscriptionPreferencesForm({
  services,
  selectedIds,
  scopeLocked,
  saveAction,
  unsubscribeAction,
}: {
  services: Service[];
  selectedIds: string[];
  scopeLocked: boolean;
  saveAction: (formData: FormData) => Promise<void>;
  unsubscribeAction: () => Promise<void>;
}) {
  const [scope, setScope] = useState<"all" | "selected">(selectedIds.length ? "selected" : "all");
  const [chosen, setChosen] = useState<string[]>(selectedIds);
  const canChoose = !scopeLocked && services.length > 0;

  return (
    <div className="space-y-6">
      {canChoose ? (
        <InlineActionForm action={saveAction} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-[var(--fg)]">What do you want to hear about?</legend>
            <label className="flex cursor-pointer items-start gap-3 border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-sm page-panel">
              <input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} className="mt-0.5 accent-[var(--page-brand)]" />
              <span>
                <span className="block font-medium text-[var(--fg)]">All services</span>
                <span className="block text-xs text-[var(--fg-soft)]">Every incident and maintenance on this page.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-sm page-panel">
              <input type="radio" name="scope" value="selected" checked={scope === "selected"} onChange={() => setScope("selected")} className="mt-0.5 accent-[var(--page-brand)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[var(--fg)]">Only the services I choose</span>
                <span className="block text-xs text-[var(--fg-soft)]">Page-wide announcements still reach you.</span>
                {scope === "selected" && (
                  <span className="mt-3 grid gap-2 sm:grid-cols-2">
                    {services.map((service) => (
                      <span key={service.id} className="flex items-center gap-2 text-sm text-[var(--fg)]">
                        <Checkbox
                          name="componentIds"
                          value={service.id}
                          checked={chosen.includes(service.id)}
                          onChange={(event) => setChosen(event.target.checked ? [...chosen, service.id] : chosen.filter((id) => id !== service.id))}
                          aria-label={service.name}
                        />
                        <span className="truncate">{service.name}</span>
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </label>
          </fieldset>
          {/* Public pages map bg-primary to the page's brand color. */}
          <PageSubmitButton pendingLabel="Saving…" className="w-full sm:w-auto" disabled={scope === "selected" && chosen.length === 0}>
            <Save aria-hidden size={16} />
            Save preferences
          </PageSubmitButton>
        </InlineActionForm>
      ) : (
        <p className="text-sm text-[var(--fg-soft)]">
          {scopeLocked ? "Service choices for this private page are set when you subscribe." : "You receive every update for this page."}
        </p>
      )}

      <InlineActionForm action={unsubscribeAction} className="border-t border-[var(--line)] pt-5">
        <p className="mb-3 text-sm text-[var(--fg-soft)]">Stop all incident and maintenance messages from this page. You can subscribe again at any time.</p>
        <PageSubmitButton variant="secondary" pendingLabel="Unsubscribing…" confirmMessage="Unsubscribe from all updates for this page?">
          <BellOff aria-hidden size={16} />
          Unsubscribe from all updates
        </PageSubmitButton>
      </InlineActionForm>
    </div>
  );
}
