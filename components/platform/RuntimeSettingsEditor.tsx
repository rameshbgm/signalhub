"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RotateCcw } from "lucide-react";
import { applyDeployment, reviewDeployment, type ApplyResult } from "@/app/platform/(protected)/deployment/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { ProxyConfiguration, SettingChange } from "@/lib/settings/review";
import type { SettingDefinition, SettingKey, SettingValues } from "@/lib/settings/registry";
import type { SettingSource } from "@/lib/settings/effective";
import type { Finding } from "@/lib/settings/validate";
import { cn } from "@/lib/utils";

export type RuntimeSettingsView = {
  canManage: boolean;
  current: { proxy: ProxyConfiguration; settings: SettingValues; sources: Record<SettingKey, SettingSource>; invalid: Partial<Record<SettingKey, string>>; proxyLocked: boolean };
  definitions: SettingDefinition[];
  /** An address built from how the browser reached this page, offered when no public address is set. */
  detectedUrl: string | null;
};

type Review = Awaited<ReturnType<typeof reviewDeployment>> & { changes: SettingChange[] };
const GROUPS: { id: SettingDefinition["group"]; title: string }[] = [
  { id: "https", title: "Address and HTTPS" },
  { id: "access", title: "Who can open Platform administration" },
  { id: "policy", title: "Sign-in policy" },
  { id: "monitoring", title: "Monitoring" },
  { id: "worker", title: "Background worker (applies on the next round)" },
];

function duration(seconds: number) {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  return `${Math.round(seconds / 60)} minutes`;
}

export function RuntimeSettingsEditor({ view }: { view: RuntimeSettingsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [proxy, setProxy] = useState<ProxyConfiguration>(view.current.proxy);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [reset, setReset] = useState<SettingKey[]>([]);
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const input = useMemo(() => ({ proxy, settings: values as Partial<Record<SettingKey, unknown>>, reset }), [proxy, values, reset]);

  // Check the proposal as it changes, so problems show before anyone presses Apply.
  const latest = useRef(0);
  useEffect(() => {
    if (!view.canManage) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      reviewDeployment(input).then((next) => { if (ticket === latest.current) setReview(next); }).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [input, view.canManage]);

  const locked = (key: SettingKey) => view.current.sources[key] === "environment";
  const shown = (key: SettingKey): unknown => {
    if (key in values) return values[key];
    if (reset.includes(key)) return view.definitions.find((definition) => definition.key === key)?.default;
    return view.current.settings[key];
  };
  const edit = (key: SettingKey, value: unknown) => { setValues((previous) => ({ ...previous, [key]: value })); setReset((previous) => previous.filter((item) => item !== key)); };
  const undo = (key: SettingKey) => { setValues((previous) => { const { [key]: _removed, ...rest } = previous; return rest; }); setReset((previous) => [...new Set([...previous, key])]); };
  function applyFix(fix: NonNullable<Finding["fix"]>) {
    if (fix.proxy) setProxy((previous) => ({ ...previous, ...fix.proxy, cidrs: [...(fix.proxy?.cidrs ?? previous.cidrs)] }));
    if (fix.settings) setValues((previous) => ({ ...previous, ...fix.settings }));
  }

  function submit() {
    startTransition(async () => {
      const outcome = await applyDeployment(input, accepted);
      setResult(outcome);
      if (outcome.ok) {
        toast(outcome.message, "ok");
        setAccepted([]);
        setReset([]);
        setValues({});
        router.refresh();
      } else setReview(outcome.review);
    });
  }

  const findings = review?.findings ?? [];
  const problems = review ? findings.filter((finding) => finding.severity !== "info") : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime settings</CardTitle>
        <CardDescription className="max-w-3xl">Set the public address, access rules, sign-in policy, and monitoring options used by this installation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section id="global-mfa" aria-label="Global MFA" className="scroll-mt-6">
          <h3 className="text-sm font-semibold text-ink">Global MFA</h3>
          {view.definitions.filter((definition) => definition.key === "mfaEnabled").map((definition) => (
            <SettingRow key={definition.key} definition={definition} value={shown("mfaEnabled")}
              source={view.current.sources.mfaEnabled} invalid={view.current.invalid.mfaEnabled}
              locked={locked("mfaEnabled") || !view.canManage} edited={"mfaEnabled" in values || reset.includes("mfaEnabled")}
              detectedUrl={null} onChange={(value) => edit("mfaEnabled", value)} onReset={() => undo("mfaEnabled")} />
          ))}
        </section>
        <div>
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-ink">
            <ChevronDown aria-hidden size={16} className={cn("transition-transform", open && "rotate-180")} />
            Edit runtime settings
          </button>
          {open && (
            <div className="mt-4 space-y-6">
              {view.current.proxyLocked && <Alert tone="info">Proxy settings are fixed by the environment (see the proxy settings below).</Alert>}
              <p className="text-sm leading-6 text-ink-soft">
                Proxy: <strong className="text-ink">{proxy.mode}</strong>, {proxy.hops} {proxy.hops === 1 ? "proxy" : "proxies"} in front
                {proxy.cidrs.length ? `, trusting ${proxy.cidrs.join(", ")}` : ", trusting any private address"}. Fine-tune it in the proxy card further down.
              </p>
              {GROUPS.map((group) => (
                <section key={group.id} aria-label={group.title} className="rounded-card border border-line bg-surface p-5">
                  <h3 className="border-b border-line pb-3 text-sm font-semibold text-ink">{group.title}</h3>
                  <div className="divide-y divide-line">
                  {view.definitions.filter((definition) => definition.group === group.id && definition.key !== "mfaEnabled").map((definition) => (
                    <SettingRow
                      key={definition.key}
                      definition={definition}
                      value={shown(definition.key as SettingKey)}
                      source={view.current.sources[definition.key as SettingKey]}
                      invalid={view.current.invalid[definition.key as SettingKey]}
                      locked={locked(definition.key as SettingKey) || !view.canManage}
                      edited={definition.key in values || reset.includes(definition.key as SettingKey)}
                      detectedUrl={definition.key === "publicUrl" ? view.detectedUrl : null}
                      onChange={(value) => edit(definition.key as SettingKey, value)}
                      onReset={() => undo(definition.key as SettingKey)}
                    />
                  ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <section aria-label="Checks" className="space-y-3">
          {review && review.changes.length > 0 && (
            <div className="rounded-control border border-line p-4">
              <h3 className="text-sm font-semibold text-ink">What will change</h3>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-soft">
                {review.changes.map((change) => (
                  <li key={change.id}><span className="font-medium text-ink">{change.label}</span>: {change.from} <span aria-hidden>→</span> <strong className="font-semibold text-ink">{change.to}</strong></li>
                ))}
              </ul>
              {review.needsConfirmation && <p className="mt-2 text-xs leading-5 text-ink-dim">This could affect how you reach this page, so it applies provisionally: press Keep within two minutes or the previous values come back on their own.</p>}
            </div>
          )}
          {review && review.ignoredLocked.length > 0 && <Alert tone="info">Fixed by the environment and left alone: {review.ignoredLocked.join(", ")}.</Alert>}
          {findings.map((finding) => (
            <Alert key={finding.id} tone={finding.severity === "error" ? "danger" : finding.severity === "warning" ? "warn" : "info"} title={finding.title}>
              <p>{finding.why}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {finding.fix && view.canManage && <Button type="button" size="sm" variant="secondary" onClick={() => applyFix(finding.fix!)}>{finding.fix.label}</Button>}
                {finding.severity === "warning" && review?.warningIds.includes(finding.id) && view.canManage && (
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={accepted.includes(finding.id)} onChange={(event) => setAccepted((previous) => event.target.checked ? [...previous, finding.id] : previous.filter((id) => id !== finding.id))} />Accept this and continue</label>
                )}
              </div>
            </Alert>
          ))}
          {result && !result.ok && <Alert tone="danger">{result.message}</Alert>}
        </section>

        {view.canManage && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={submit} loading={pending} disabled={pending || Boolean(review?.blocking) || review?.changes.length === 0}>
              Save changes
            </Button>
            {review?.blocking && <span className="text-sm text-danger-fg">Fix the errors above to continue.</span>}
            {!review?.blocking && problems.length > 0 && <span className="text-sm text-ink-soft">{problems.length} to look at. Warnings can be accepted.</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingRow({ definition, value, source, invalid, locked, edited, detectedUrl, onChange, onReset }: {
  definition: SettingDefinition; value: unknown; source: SettingSource; invalid?: string; locked: boolean; edited: boolean;
  detectedUrl: string | null; onChange: (value: unknown) => void; onReset: () => void;
}) {
  const id = `setting-${definition.key}`;
  const badge = source === "environment" ? <StatusBadge tone="info">Fixed by {definition.env}</StatusBadge> : source === "admin" || edited ? <StatusBadge tone="neutral">{edited ? "Edited" : "Saved"}</StatusBadge> : <StatusBadge tone="neutral">Default</StatusBadge>;
  return (
    <div className="space-y-2 py-4 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{definition.label}</span>
        {badge}
        {(source === "admin" || edited) && !locked && (
          <button type="button" onClick={onReset} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary-ink" aria-label={`Reset ${definition.label} to its default`}>
            <RotateCcw aria-hidden size={12} />Reset
          </button>
        )}
      </div>
      <p className="text-sm leading-6 text-ink-soft">{definition.help}</p>
      {invalid && <Alert tone="warn">{invalid}</Alert>}
      {definition.kind === "boolean" && <Switch id={id} label={value ? "On" : "Off"} checked={Boolean(value)} disabled={locked} onChange={(event) => onChange(event.target.checked)} />}
      {definition.kind === "integer" && (
        <Field label="" htmlFor={id} hint={typeof value === "number" && definition.unit === "seconds" ? `= ${duration(value)}` : definition.unit}>
          <Input id={id} type="number" min={definition.min} max={definition.max} value={Number(value)} disabled={locked} className="max-w-xs" onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} />
        </Field>
      )}
      {definition.kind === "enum" && (
        <div className="flex flex-wrap gap-4" role="radiogroup" aria-label={definition.label}>
          {definition.options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm has-[:disabled]:opacity-60"><Radio name={id} checked={value === option.value} disabled={locked} onChange={() => onChange(option.value)} />{option.label}</label>
          ))}
        </div>
      )}
      {definition.kind === "url" && (
        <div className="space-y-2">
          <Input id={id} type="url" value={typeof value === "string" ? value : ""} placeholder="https://status.example.com" disabled={locked} onChange={(event) => onChange(event.target.value.trim() === "" ? null : event.target.value)} />
          {detectedUrl && value !== detectedUrl && !locked && <button type="button" onClick={() => onChange(detectedUrl)} className="text-sm font-medium text-primary underline underline-offset-2">Use the address you are using now: {detectedUrl}</button>}
        </div>
      )}
      {definition.kind === "cidrs" && (
        <textarea id={id} rows={3} spellCheck={false} disabled={locked} value={Array.isArray(value) ? value.join("\n") : ""} placeholder="Empty means any network. One range per line, e.g. 203.0.113.0/24"
          className="w-full rounded-control border border-line bg-surface px-3 py-2 font-mono text-[0.8125rem] text-ink focus-visible:ring-4 focus-visible:ring-primary/25"
          onChange={(event) => onChange(event.target.value.split(/[\s,]+/).filter(Boolean))} />
      )}
    </div>
  );
}
