"use client";

import { useState } from "react";
import { Network, Save } from "lucide-react";
import { updateProxyTrust } from "@/app/platform/(protected)/configuration/actions";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { PlatformSubmitButton } from "@/components/platform/PlatformSubmitButton";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ModeExplanation, ProxyDiagnosis, ProxyTrustMode } from "@/lib/proxy-trust";
import { cn } from "@/lib/utils";

export type ProxyTrustView = {
  canManage: boolean;
  mode: ProxyTrustMode;
  hops: number;
  /** TRUST_PROXY_HEADERS / TRUSTED_PROXY_HOPS in the environment fix these values. */
  modeLocked: boolean;
  hopsLocked: boolean;
  /** Trusted network ranges; empty means "any private or loopback address". */
  cidrs: string[];
  cidrsLocked: boolean;
  /** Entries of TRUSTED_PROXY_CIDRS that could not be parsed (the variable is then ignored). */
  cidrsInvalid: string[];
  diagnosis: ProxyDiagnosis;
  explanations: Record<ProxyTrustMode, ModeExplanation>;
};

const ORDER: ProxyTrustMode[] = ["auto", "on", "off"];
const KIND_LABEL = { loopback: "this computer", private: "private network", public: "public internet", unknown: "unknown" } as const;

export function ProxyTrustCard({ view }: { view: ProxyTrustView }) {
  const { diagnosis, explanations } = view;
  const [selected, setSelected] = useState<ProxyTrustMode>(view.mode);
  const [rangeMode, setRangeMode] = useState<"default" | "custom">(view.cidrs.length ? "custom" : "default");
  const [ranges, setRanges] = useState(view.cidrs.join("\n"));
  const disabled = !view.canManage || view.modeLocked;
  const picked = explanations[selected];
  const matches = selected === diagnosis.recommendedMode;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Network aria-hidden size={16} />Visitor addresses and reverse proxy</CardTitle>
        <CardDescription className="max-w-2xl">
          How SignalHub learns who is calling. The address drives rate limits, IP allowlists, and the addresses recorded on sessions and audit logs. Auto is right for almost everyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-label="What we detected" className="space-y-3 rounded-control border border-line bg-sunken/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">What we detected from your connection</h3>
            <StatusBadge tone={diagnosis.behindProxy === "yes" ? "ok" : diagnosis.behindProxy === "no" ? "neutral" : "warn"}>
              {diagnosis.behindProxy === "yes" ? "Reverse proxy in front" : diagnosis.behindProxy === "no" ? "No proxy in front" : "Cannot tell"}
            </StatusBadge>
          </div>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Detail label="Connection comes from" value={diagnosis.peer ? `${diagnosis.peer} (${KIND_LABEL[diagnosis.peerKind]})` : "Not visible"} />
            <Detail label="Forwarded address header" value={diagnosis.forwardedFor.length ? diagnosis.forwardedFor.join(", ") : "None"} />
            <Detail label="Passed through" value={diagnosis.hints.length ? diagnosis.hints.join(", ") : "Nothing recognised"} />
            <Detail label="Protocol seen by the proxy" value={diagnosis.protocol ?? "Not reported"} />
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
            {diagnosis.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <p className="text-xs leading-5 text-ink-dim">
            Your own request would be recorded as{" "}
            {ORDER.map((mode, index) => (
              <span key={mode}>
                {index > 0 && ", "}
                <strong className="font-mono font-medium text-ink-soft">{diagnosis.clientIpByMode[mode]}</strong> under {explanations[mode].title}
              </span>
            ))}
            .
          </p>
        </section>

        {view.modeLocked && (
          <Alert tone="info" title="Fixed by the deployment">
            TRUST_PROXY_HEADERS is set in the server environment, so it takes precedence and cannot be changed here. Remove it from the environment to manage this setting from this page.
          </Alert>
        )}

        <PlatformActionForm action={updateProxyTrust} successMessage="Saved" className="space-y-5">
          <fieldset disabled={disabled} className="space-y-3">
            <legend className="sr-only">How to treat forwarded addresses</legend>
            <div className="grid gap-3 lg:grid-cols-3">
              {ORDER.map((mode) => {
                const active = selected === mode;
                return (
                  <label
                    key={mode}
                    className={cn(
                      "flex cursor-pointer flex-col gap-2 rounded-control border p-4 transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70",
                      active ? "border-primary bg-primary-soft/40" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Radio name="mode" value={mode} checked={active} onChange={() => setSelected(mode)} />
                      <span className="font-semibold text-ink">{explanations[mode].title}</span>
                      {mode === diagnosis.recommendedMode && <StatusBadge tone="ok">Recommended for you</StatusBadge>}
                      {mode === view.mode && <StatusBadge tone="info">Current</StatusBadge>}
                    </span>
                    <span className="text-sm leading-6 text-ink-soft">{explanations[mode].summary}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {view.modeLocked && <input type="hidden" name="mode" value={view.mode} />}

          <div className="space-y-3" aria-live="polite">
            <h3 className="text-sm font-semibold text-ink">Why {picked.title} {matches ? "fits your setup" : "is worth knowing about"}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
              {picked.why.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {picked.caution && <Alert tone={(selected === "on" && diagnosis.behindProxy === "no") || (selected === "off" && diagnosis.behindProxy === "yes") ? "danger" : "warn"} title="Keep in mind">{picked.caution}</Alert>}
            {matches && diagnosis.behindProxy !== "unknown" && <Alert tone="ok">This matches what we detected from your connection.</Alert>}
          </div>

          {selected !== "off" && (
            <Field
              label="Proxies in front of this server"
              htmlFor="proxy-hops"
              hint={
                view.hopsLocked
                  ? "Fixed by TRUSTED_PROXY_HOPS in the deployment environment."
                  : diagnosis.behindProxy === "yes"
                    ? `Detected ${diagnosis.suggestedHops} from this request. Count every reverse proxy and CDN between visitors and this server; use 1 for a single proxy.`
                    : "Count every reverse proxy and CDN between visitors and this server; use 1 for a single proxy."
              }
              className="max-w-xs"
            >
              <Input id="proxy-hops" name="hops" type="number" min={1} max={10} defaultValue={view.hops} disabled={!view.canManage} readOnly={view.hopsLocked} />
            </Field>
          )}
          {selected === "off" && <input type="hidden" name="hops" value={view.hops} />}

          {selected !== "off" && (
            <fieldset disabled={!view.canManage || view.cidrsLocked} className="space-y-3">
              <legend className="text-sm font-semibold text-ink">Which connections count as your proxy?</legend>
              {view.cidrsLocked && (
                <Alert tone="info">Fixed by TRUSTED_PROXY_CIDRS in the deployment environment.</Alert>
              )}
              {view.cidrsInvalid.length > 0 && (
                <Alert tone="warn" title="TRUSTED_PROXY_CIDRS is ignored">
                  These entries are not valid ranges: {view.cidrsInvalid.join(", ")}. Fix the variable or remove it.
                </Alert>
              )}
              <div className="grid gap-3 lg:grid-cols-2">
                {([
                  ["default", selected === "on" ? "Any connection" : "Any private network address", selected === "on" ? "Believe the forwarded address from every connection. Only safe when the proxy is the only way in." : "Loopback, 10/8, 172.16/12, 192.168/16, 100.64/10 and IPv6 unique-local. Works with no setup."],
                  ["custom", "Only these network ranges", "A neighbour on the same network cannot forge an address. Best for Kubernetes, shared networks and CDNs with published ranges."],
                ] as const).map(([value, title, text]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1.5 rounded-control border p-4 transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70",
                      rangeMode === value ? "border-primary bg-primary-soft/40" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Radio name="cidrMode" value={value} checked={rangeMode === value} onChange={() => setRangeMode(value)} />
                      <span className="font-semibold text-ink">{title}</span>
                    </span>
                    <span className="text-sm leading-6 text-ink-soft">{text}</span>
                  </label>
                ))}
              </div>
              {rangeMode === "custom" && (
                <Field
                  label="Trusted network ranges"
                  htmlFor="proxy-cidrs"
                  hint={
                    diagnosis.peer
                      ? `Your connection comes from ${diagnosis.peer}${diagnosis.peerTrusted === false ? ", which these ranges do not include" : diagnosis.peerTrusted ? ", which these ranges include" : ""}. One range per line, for example 10.244.0.0/16 or fd00::/8.`
                      : "One range per line, for example 10.244.0.0/16 or fd00::/8."
                  }
                >
                  <textarea
                    id="proxy-cidrs"
                    name="cidrs"
                    rows={3}
                    value={ranges}
                    onChange={(event) => setRanges(event.target.value)}
                    spellCheck={false}
                    className="w-full rounded-control border border-line bg-surface px-3 py-2 font-mono text-[0.8125rem] text-ink focus-visible:ring-4 focus-visible:ring-primary/25"
                    placeholder={diagnosis.suggestedCidr ?? "10.244.0.0/16"}
                  />
                </Field>
              )}
              {diagnosis.suggestedCidr && !view.cidrsLocked && view.canManage && (
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline underline-offset-2"
                  onClick={() => { setRangeMode("custom"); setRanges(diagnosis.suggestedCidr!); }}
                >
                  Use the detected range {diagnosis.suggestedCidr} (the network of your proxy)
                </button>
              )}
            </fieldset>
          )}
          {view.cidrsLocked && <input type="hidden" name="cidrMode" value={view.cidrs.length ? "custom" : "default"} />}
          {view.cidrsLocked && <input type="hidden" name="cidrs" value={view.cidrs.join("\n")} />}

          {view.canManage && !(view.modeLocked && view.hopsLocked) && (
            <PlatformSubmitButton pendingLabel="Saving…"><Save aria-hidden size={14} />Save</PlatformSubmitButton>
          )}
        </PlatformActionForm>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-dim">{label}</dt>
      <dd className="break-words font-mono text-[0.8125rem] text-ink">{value}</dd>
    </div>
  );
}
