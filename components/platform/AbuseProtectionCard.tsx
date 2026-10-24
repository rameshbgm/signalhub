"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, ShieldAlert } from "lucide-react";
import { saveRateLimits } from "@/app/platform/(protected)/deployment/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import type { Limiter, RateLimitPreset } from "@/lib/rate-limit-policy";

export type LimiterView = Limiter & {
  current: { limit: number; windowSeconds: number; source: "environment" | "admin" | "default"; invalid?: string };
  envName: string;
};

const PRESETS: { id: RateLimitPreset; label: string; text: string }[] = [
  { id: "standard", label: "Standard", text: "The built-in limits." },
  { id: "relaxed", label: "Relaxed", text: "Five times the per-address limits. For many real visitors behind one shared address, such as a school, office or mobile carrier." },
  { id: "strict", label: "Strict", text: "Half the per-address limits. For targeted abuse. Per-account limits are never changed by a preset." },
];

function human(seconds: number) {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** Every rate limit, editable, with presets. Takes effect on the very next request. */
export function AbuseProtectionCard({ limiters, presets, canManage }: { limiters: LimiterView[]; presets: Record<RateLimitPreset, Partial<Record<string, { limit: number; windowSeconds: number }>>>; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = () => Object.fromEntries(limiters.map((limiter) => [limiter.id, { limit: limiter.current.limit, windowSeconds: limiter.current.windowSeconds }]));
  const [values, setValues] = useState<Record<string, { limit: number; windowSeconds: number }>>(initial);
  const [errors, setErrors] = useState<string[]>([]);

  const locked = (limiter: LimiterView) => limiter.current.source === "environment" || !canManage;
  const differs = (limiter: LimiterView) => values[limiter.id].limit !== limiter.limit || values[limiter.id].windowSeconds !== limiter.windowSeconds;
  /** Changed in this form but not saved yet. */
  const dirty = (limiter: LimiterView) => values[limiter.id].limit !== limiter.current.limit || values[limiter.id].windowSeconds !== limiter.current.windowSeconds;
  const set = (id: string, patch: Partial<{ limit: number; windowSeconds: number }>) => setValues((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  const applyPreset = (preset: RateLimitPreset) => setValues(Object.fromEntries(limiters.map((limiter) => [limiter.id, locked(limiter) ? values[limiter.id] : (presets[preset][limiter.id] ?? { limit: limiter.limit, windowSeconds: limiter.windowSeconds })])));

  function save() {
    const overrides = Object.fromEntries(limiters.filter((limiter) => !locked(limiter) && differs(limiter)).map((limiter) => [limiter.id, values[limiter.id]]));
    startTransition(async () => {
      const result = await saveRateLimits(overrides);
      setErrors(result.errors ?? []);
      toast(result.message, result.ok ? "ok" : "danger");
      if (result.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldAlert aria-hidden size={16} />Abuse protection</CardTitle>
        <CardDescription className="max-w-3xl">
          How many times each action may be tried before visitors are told to wait. Changes apply to the very next request, with no restart. Each limit has a floor, so protection cannot be switched off.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          {PRESETS.map((preset) => (
            <button key={preset.id} type="button" disabled={!canManage} onClick={() => applyPreset(preset.id)} className="rounded-control border border-line p-4 text-left transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60">
              <span className="font-semibold text-ink">{preset.label}</span>
              <span className="mt-1 block text-sm leading-6 text-ink-soft">{preset.text}</span>
            </button>
          ))}
        </div>
        {errors.length > 0 && <Alert tone="danger" title="Some limits were not saved"><ul className="list-disc pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></Alert>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-dim"><tr><th className="py-2 pr-4">Limit</th><th className="py-2 pr-4">Attempts</th><th className="py-2 pr-4">Per (seconds)</th><th className="py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {limiters.map((limiter) => (
                <tr key={limiter.id}>
                  <td className="py-3 pr-4 align-top">
                    <p className="font-medium text-ink">{limiter.label}</p>
                    <p className="text-xs leading-5 text-ink-dim">{limiter.protects}</p>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <Input aria-label={`${limiter.label}: attempts`} type="number" min={limiter.minLimit} max={limiter.maxLimit} value={values[limiter.id].limit} disabled={locked(limiter)} className="w-24" onChange={(event) => set(limiter.id, { limit: Number(event.target.value) })} />
                    <p className="mt-1 text-xs text-ink-dim">{limiter.minLimit} to {limiter.maxLimit}</p>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <Input aria-label={`${limiter.label}: window in seconds`} type="number" min={10} max={86400} value={values[limiter.id].windowSeconds} disabled={locked(limiter)} className="w-28" onChange={(event) => set(limiter.id, { windowSeconds: Number(event.target.value) })} />
                    <p className="mt-1 text-xs text-ink-dim">{human(values[limiter.id].windowSeconds)}</p>
                  </td>
                  <td className="py-3 align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      {limiter.current.source === "environment" ? <StatusBadge tone="info">Fixed by {limiter.envName}</StatusBadge> : dirty(limiter) ? <StatusBadge tone="warn">Edited</StatusBadge> : <StatusBadge tone="neutral">{limiter.current.source === "admin" ? "Saved" : "Default"}</StatusBadge>}
                      {!locked(limiter) && differs(limiter) && (
                        <button type="button" onClick={() => set(limiter.id, { limit: limiter.limit, windowSeconds: limiter.windowSeconds })} className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink" aria-label={`Reset ${limiter.label} to its default`}><RotateCcw aria-hidden size={12} />Default {limiter.limit}</button>
                      )}
                    </div>
                    {limiter.current.invalid && <p className="mt-1 text-xs text-warn-fg">{limiter.current.invalid}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage && <Button type="button" onClick={save} loading={pending} disabled={pending}>Save limits</Button>}
      </CardContent>
    </Card>
  );
}
