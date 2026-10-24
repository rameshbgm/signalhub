"use client";

import { useState, useTransition } from "react";
import { Activity, Check, Globe, Info, Network, Server, Timer, type LucideIcon } from "lucide-react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ComboInput } from "@/components/ui/combo-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckRow } from "@/components/admin/operate-ui";
import { FormActionBar } from "@/components/admin/FormActionBar";
import { MonitorKindDialog } from "@/components/admin/MonitorKindDialog";
import { ProxyManager } from "@/components/admin/ProxyManager";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";
import type { MonitorRow } from "@/lib/postgres/schema";
import type { AuthConfigView } from "@/lib/monitor-auth";
import { proxyLabel, type ProxyItem } from "@/lib/proxy-shared";
import { domainEligibility, monitorHostname } from "@/lib/domain-name";
import { hostAndPort, kindOfType, MONITOR_KINDS, typeForKind, type MonitorKind } from "@/lib/monitor-kinds";
import { cn } from "@/lib/utils";
import { INPUT_LIMITS, MONITOR_TAGS_HINT, MONITOR_TAGS_PATTERN } from "@/lib/input-limits";
import { Button } from "@/components/ui/button";
import type { MonitorTestResult } from "@/lib/monitor-test";

const KIND_ICON: Record<MonitorKind, LucideIcon> = { WEBSITE: Globe, PORT: Server, PING: Activity, DNS: Network, JOB: Timer };

const TARGET_LABEL: Record<MonitorKind, { label: string; placeholder: string }> = {
  WEBSITE: { label: "URL", placeholder: "https://example.com/health" },
  PORT: { label: "Host", placeholder: "host.example.com" },
  PING: { label: "Host", placeholder: "host.example.com" },
  DNS: { label: "Domain name", placeholder: "example.com" },
  JOB: { label: "", placeholder: "" },
};

/** "What do you want to watch?" as cards. When editing, the kind is fixed and the others are dimmed. */
function KindPicker({ kind, onChange, locked }: { kind: MonitorKind; onChange: (kind: MonitorKind) => void; locked: boolean }) {
  const [details, setDetails] = useState<MonitorKind | null>(null);
  const info = MONITOR_KINDS.find((option) => option.kind === details) ?? null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ink">What do you want to watch?</legend>
      <div role="radiogroup" aria-label="Monitor type" className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {MONITOR_KINDS.map((option) => {
          const Icon = KIND_ICON[option.kind];
          const selected = option.kind === kind;
          return (
            <div
              key={option.kind}
              className={cn(
                "overflow-hidden rounded-control border transition-colors duration-200",
                selected ? "border-ok bg-ok-bg/40" : "border-line",
                locked && !selected && "opacity-45",
              )}
            >
              {/* Only this label selects the card; the details button below is outside it so opening it never changes the choice. */}
              <label className={cn("flex items-start gap-3 p-3 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary/25", locked ? (selected ? "cursor-default" : "cursor-not-allowed") : "cursor-pointer hover:bg-sunken/70")}>
                <input type="radio" className="sr-only" checked={selected} disabled={locked && !selected} onChange={() => onChange(option.kind)} aria-label={option.title} />
                <Icon aria-hidden size={18} className={cn("mt-0.5 shrink-0", selected ? "text-ok-fg" : "text-ink-dim")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{option.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-ink-dim">{option.description}</span>
                </span>
                <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors", selected ? "border-ok bg-ok text-white" : "border-line-strong bg-surface")}>
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
              </label>
              {selected && (
                <div aria-hidden className="flex items-center gap-1.5 border-t border-ok/30 bg-ok-bg px-3 py-1 text-xs font-semibold text-ok-fg">
                  <Check size={12} strokeWidth={3} /> Selected
                </div>
              )}
              <button
                type="button"
                onClick={() => setDetails(option.kind)}
                className="flex w-full items-center justify-between gap-2 border-t border-line/70 px-3 py-2 text-left text-xs font-semibold text-primary-ink outline-none hover:bg-sunken/70 focus-visible:ring-4 focus-visible:ring-primary/25"
              >
                <span>When and how to use it<span className="sr-only"> ({option.title})</span></span>
                <Info aria-hidden size={14} />
              </button>
            </div>
          );
        })}
      </div>
      {locked && <p className="text-xs text-ink-dim">The kind of monitor can&apos;t be changed after it is created.</p>}
      <MonitorKindDialog info={info} icon={KIND_ICON[details ?? kind]} onClose={() => setDetails(null)} />
    </fieldset>
  );
}

/** Monitor fields the form edits. Picked explicitly so stored secrets never reach the browser. */
export type MonitorFormValues = Pick<MonitorRow,
  | "id" | "name" | "type" | "target" | "port" | "componentId" | "method" | "expectedStatusRange" | "timeoutMs"
  | "requestHeaders" | "requestBody" | "keywordMatch" | "keywordAbsent" | "sslWarnDays" | "dnsRecordType"
  | "dnsExpectedValue" | "heartbeatGraceSec" | "verifyTls" | "cacheBuster" | "saveErrorResponse" | "certExpiryNotify" | "domainExpiryNotify" | "proxyId" | "ipFamily" | "upsideDown" | "authType" | "authUsername" | "authHeaderName"
  | "intervalSec" | "failThreshold" | "recoverThreshold" | "downStatus" | "groupName" | "tags"
  | "actionFlipStatus" | "actionRecordMetric" | "actionAutoIncident" | "actionNotify"
> & { hasAuthSecret: boolean; authView: AuthConfigView };

/** One titled group of related fields. Always mounted, so every input submits. */
function FormCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader tinted>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/** A titled block inside a card, for settings that belong to the card but form their own group. */
function SubSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-5 text-ink-dim">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Full-page create/edit form shared by `/organization/monitors/new` and `/organization/monitors/[id]/edit`. */
export function MonitorForm({
  action,
  components,
  groups = [],
  monitor,
  cancelHref,
  proxies = [],
  createProxy,
  defaultProxyId = "",
  expiryDefaults = { certDays: 14, domainDays: 30 },
  pageSwitcher,
  returnToService = false,
  testAction,
}: {
  action: (formData: FormData) => void;
  components: { id: string; name: string }[];
  /** Existing monitor group names, offered as suggestions; any new name can still be typed. */
  groups?: string[];
  /** When set, the form edits this monitor: its type is fixed and fields start from its values. */
  monitor?: MonitorFormValues;
  cancelHref: string;
  /** The organization's proxies; managed from the dialog next to the proxy select. */
  proxies?: ProxyItem[];
  /** Creates a proxy from the dialog. */
  createProxy?: (formData: FormData) => Promise<void>;
  /** Preselected for a new monitor. */
  defaultProxyId?: string;
  /** The organization's warning windows from Settings, shown in the hints. */
  expiryDefaults?: { certDays: number; domainDays: number };
  /** "Posting to <page> Change", the third field of the first row. */
  pageSwitcher?: React.ReactNode;
  /** Return to Add a service after creating an unlinked monitor. */
  returnToService?: boolean;
  testAction?: (formData: FormData) => Promise<MonitorTestResult>;
}) {
  const [kind, setKind] = useState<MonitorKind>(monitor ? kindOfType(monitor.type) : "WEBSITE");
  const [checkCertificate, setCheckCertificate] = useState(monitor?.type === "TLS" || monitor?.type === "SSL");
  // The stored check type follows from the kind (and the certificate toggle for ports).
  const type = typeForKind(kind, checkCertificate);
  const [authType, setAuthType] = useState(monitor?.authType ?? "NONE");
  const chooseKind = (next: MonitorKind) => {
    setKind(next);
    setAuthType("NONE");
    if (next !== "PORT") setCheckCertificate(false);
  };
  // TLS monitors saved with an https:// target show their host and port in separate fields.
  const prefill = monitor ? hostAndPort(monitor.type, monitor.target, monitor.port) : { host: "", port: null as number | null };
  const [proxyId, setProxyId] = useState(monitor?.proxyId ?? defaultProxyId);
  // A proxy created from the dialog is selected right away, unless one was already chosen.
  const [seenProxies, setSeenProxies] = useState(() => new Set(proxies.map((proxy) => proxy.id)));
  const added = proxies.find((proxy) => !seenProxies.has(proxy.id));
  if (added) {
    setSeenProxies(new Set(proxies.map((proxy) => proxy.id)));
    if (!proxyId) setProxyId(added.id);
  }
  const [target, setTarget] = useState(prefill.host);
  const hostname = monitorHostname(type, target);
  const domain = domainEligibility(hostname);
  const editing = Boolean(monitor);
  const isHttpLike = kind === "WEBSITE";
  const [testResult, setTestResult] = useState<MonitorTestResult | null>(null);
  const [testing, startTest] = useTransition();
  const testHint = testing ? "Testing the current settings…" : kind === "JOB" ? "Save the monitor, then send a ping to its heartbeat URL to test it." : testResult ? (
    <span className={testResult.ok ? "text-ok-fg" : "text-danger-fg"}>
      {testResult.ok ? "Last test passed" : `Last test failed: ${testResult.message}`}
      {testResult.statusCode !== null && ` · HTTP ${testResult.statusCode}`}
      {testResult.latencyMs !== null && ` · ${testResult.latencyMs} ms`}
      {" · Nothing saved."}
    </span>
  ) : "Checks run in the worker on the interval you set. Changes apply on the next poll.";

  return (
    <PlatformActionForm action={action} preserveOnError successMessage={editing ? "Monitor saved" : "Monitor added"} className="space-y-6 text-sm">
      {returnToService && <input type="hidden" name="returnToService" value="true" />}
      <div className="space-y-6">
        <FormCard title="Monitor details" description="What to check, how often, and which service it reports to.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Monitor name" htmlFor="monitor-name" required>
              <Input id="monitor-name" name="name" defaultValue={monitor?.name} maxLength={INPUT_LIMITS.title} placeholder="Monitor name" required />
            </Field>
            {!returnToService && <Field label="Linked service" htmlFor="monitor-component" hint="Link a service and enable automatic status updates to update its public status. Without a link, this monitor only records checks and alerts.">
              <Select id="monitor-component" aria-label="Linked service" name="componentId" defaultValue={monitor?.componentId ?? ""}>
                <option value="">Not linked to a service</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>}
            {pageSwitcher}
            <div className="col-span-full"><KindPicker kind={kind} onChange={chooseKind} locked={editing} /></div>
            <input type="hidden" name="type" value={type} />
            {kind !== "JOB" && (
              <Field label={TARGET_LABEL[kind].label} htmlFor="monitor-target" className="col-span-full" required>
                <Input
                  id="monitor-target"
                  name="target" defaultValue={prefill.host} onChange={(e) => setTarget(e.target.value)} maxLength={INPUT_LIMITS.url}
                  placeholder={TARGET_LABEL[kind].placeholder}
                  className="font-mono"
                  required
                />
              </Field>
            )}
            {kind === "JOB" && <Input type="hidden" name="target" maxLength={INPUT_LIMITS.url} value="inbound-heartbeat" />}

            {kind === "PORT" && (
              <>
                <Field label="Port" htmlFor="monitor-port" required>
                  <Input id="monitor-port" name="port" type="number" min={1} max={65535} defaultValue={prefill.port ?? undefined} placeholder="e.g. 443" required />
                </Field>
                <CheckRow checked={checkCertificate} onChange={(event) => setCheckCertificate(event.target.checked)} label="Also check the TLS certificate" hint="Connects with TLS and warns before the certificate expires. Leave off for a plain TCP port." className="sm:self-end" />
              </>
            )}

            <Field label="Interval (seconds)" htmlFor="monitor-interval" hint="How often the monitor polls the target.">
              <Input id="monitor-interval" name="intervalSec" type="number" min={10} max={86400} defaultValue={monitor?.intervalSec ?? 300} placeholder="Interval (sec)" />
            </Field>
            <Field label="Monitor group" htmlFor="monitor-group">
              <ComboInput id="monitor-group" name="groupName" options={groups} defaultValue={monitor?.groupName ?? ""} maxLength={INPUT_LIMITS.monitorGroup} autoComplete="off" placeholder="Select or type a group" />
            </Field>
            <Field label="Tags" htmlFor="monitor-tags">
              <Input id="monitor-tags" name="tags" defaultValue={monitor?.tags?.join(", ") ?? ""} maxLength={INPUT_LIMITS.monitorTags * (INPUT_LIMITS.monitorTag + 2)} pattern={MONITOR_TAGS_PATTERN} title={MONITOR_TAGS_HINT} placeholder="Tags, comma separated" />
            </Field>
          </div>
        </FormCard>

        <div className="columns-1 gap-6 xl:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
          {isHttpLike && (
            <FormCard title="HTTP request" description="The request sent on every check, what a healthy response looks like, and how the monitor authenticates.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="HTTP method" htmlFor="monitor-method">
                  <Select id="monitor-method" aria-label="HTTP method" name="method" defaultValue={monitor?.method ?? "GET"}>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="HEAD">HEAD</option>
                  </Select>
                </Field>
                <Field label="Expected status" htmlFor="monitor-status-range" hint="A range such as 200-299. For one status, repeat it: 418-418.">
                  <Input id="monitor-status-range" name="expectedStatusRange" maxLength={INPUT_LIMITS.monitorStatusRange} defaultValue={monitor?.expectedStatusRange ?? "200-299"} placeholder="Expected status (e.g. 200-299)" />
                </Field>
                <Field label="Timeout (ms)" htmlFor="monitor-timeout-http">
                  <Input id="monitor-timeout-http" name="timeoutMs" type="number" min={100} max={60000} defaultValue={monitor?.timeoutMs ?? 10000} placeholder="Timeout (ms)" />
                </Field>
              </div>
              <Field label="Custom headers" htmlFor="monitor-headers" hint="A JSON object.">
                <Textarea id="monitor-headers" name="requestHeaders" defaultValue={monitor?.requestHeaders} maxLength={INPUT_LIMITS.monitorRequestHeaders} placeholder='Custom headers JSON, e.g. {"X-Api-Key":"abc"}' className="font-mono" rows={2} />
              </Field>
              <Field label="Request body" htmlFor="monitor-body">
                <Textarea id="monitor-body" name="requestBody" defaultValue={monitor?.requestBody ?? ""} maxLength={INPUT_LIMITS.monitorRequestBody} placeholder="POST body (optional)" className="font-mono" rows={2} />
              </Field>
              <SubSection title="Content check" description="Optional. Also look inside the response body, for example to catch an error page that still answers 200.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Body must contain" htmlFor="monitor-keyword" hint="Monitor is marked down if the response body does not contain this text.">
                    <Input id="monitor-keyword" name="keywordMatch" defaultValue={monitor?.keywordMatch ?? ""} maxLength={INPUT_LIMITS.monitorKeyword} placeholder="Body must contain (optional)" />
                  </Field>
                  <Field label="Body must not contain" htmlFor="monitor-keyword-absent" hint="Monitor is marked down if the response body contains this text.">
                    <Input id="monitor-keyword-absent" name="keywordAbsent" defaultValue={monitor?.keywordAbsent ?? ""} maxLength={INPUT_LIMITS.monitorKeyword} placeholder="Body must NOT contain (optional)" />
                  </Field>
                </div>
              </SubSection>
              <SubSection title="Security and authentication" description="How the monitor identifies itself and treats TLS errors.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Authentication type" htmlFor="monitor-auth-type">
                    <Select id="monitor-auth-type" aria-label="Authentication type" name="authType" value={authType} onChange={(e) => setAuthType(e.target.value)}>
                      <option value="NONE">None</option>
                      <option value="BASIC">HTTP Basic Auth</option>
                      <option value="BEARER">Bearer Token</option>
                      <option value="OAUTH2">OAuth2: Client Credentials</option>
                      <option value="MTLS">mTLS</option>
                      <option value="HEADER">Custom header</option>
                    </Select>
                  </Field>
                </div>
                {authType === "BASIC" && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Username" htmlFor="monitor-auth-user">
                      <Input id="monitor-auth-user" name="authUsername" defaultValue={monitor?.authUsername ?? ""} maxLength={INPUT_LIMITS.monitorAuthUsername} placeholder="Username" />
                    </Field>
                    <Field label="Password" htmlFor="monitor-auth-secret">
                      <Input id="monitor-auth-secret" name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder={editing && monitor?.hasAuthSecret ? "Leave blank to keep current" : "Password"} />
                    </Field>
                  </div>
                )}
                {authType === "BEARER" && (
                  <Field label="Bearer token" htmlFor="monitor-auth-secret">
                    <Input id="monitor-auth-secret" name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder={editing && monitor?.hasAuthSecret ? "Leave blank to keep current" : "Bearer token"} />
                  </Field>
                )}
                {authType === "OAUTH2" && (
                  <div className="space-y-4">
                    <Field label="Token URL" htmlFor="monitor-oauth-token-url" hint="The authorization server's token endpoint." required>
                      <Input id="monitor-oauth-token-url" name="oauthTokenUrl" defaultValue={monitor?.authView.tokenUrl ?? ""} maxLength={INPUT_LIMITS.url} placeholder="https://auth.example.com/oauth/token" className="font-mono" required />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Client ID" htmlFor="monitor-oauth-client-id" required>
                        <Input id="monitor-oauth-client-id" name="oauthClientId" defaultValue={monitor?.authView.clientId ?? ""} maxLength={INPUT_LIMITS.monitorAuthUsername} autoComplete="off" required />
                      </Field>
                      <Field label="Client secret" htmlFor="monitor-oauth-client-secret">
                        <Input id="monitor-oauth-client-secret" name="oauthClientSecret" type="password" maxLength={INPUT_LIMITS.monitorAuthSecret} autoComplete="new-password" placeholder={monitor?.authView.hasClientSecret ? "Leave blank to keep current" : "Client secret"} />
                      </Field>
                      <Field label="Scope" htmlFor="monitor-oauth-scope" hint="Optional, space separated.">
                        <Input id="monitor-oauth-scope" name="oauthScope" defaultValue={monitor?.authView.scope ?? ""} maxLength={INPUT_LIMITS.monitorOAuthScope} placeholder="read:status" />
                      </Field>
                      <Field label="Audience" htmlFor="monitor-oauth-audience" hint="Optional; some providers require it.">
                        <Input id="monitor-oauth-audience" name="oauthAudience" defaultValue={monitor?.authView.audience ?? ""} maxLength={INPUT_LIMITS.monitorOAuthScope} />
                      </Field>
                    </div>
                    <Field label="Send client credentials" htmlFor="monitor-oauth-credentials-in" className="sm:max-w-sm">
                      <Select id="monitor-oauth-credentials-in" aria-label="Send client credentials" name="oauthCredentialsIn" defaultValue={monitor?.authView.credentialsIn ?? "body"}>
                        <option value="body">In the request body</option>
                        <option value="basic">As an HTTP Basic header</option>
                      </Select>
                    </Field>
                  </div>
                )}
                {authType === "MTLS" && (
                  <div className="space-y-4">
                    <Field label="Client certificate" htmlFor="monitor-mtls-cert" hint="PEM encoded, including the BEGIN and END lines." required>
                      <Textarea id="monitor-mtls-cert" name="mtlsCert" defaultValue={monitor?.authView.cert ?? ""} maxLength={INPUT_LIMITS.monitorPem} placeholder="-----BEGIN CERTIFICATE-----" className="font-mono" rows={5} spellCheck={false} />
                    </Field>
                    <Field label="Private key" htmlFor="monitor-mtls-key" hint="Stored encrypted and never shown again.">
                      <Textarea id="monitor-mtls-key" name="mtlsKey" maxLength={INPUT_LIMITS.monitorPem} placeholder={monitor?.authView.hasKey ? "Leave blank to keep the stored key" : "-----BEGIN PRIVATE KEY-----"} className="font-mono" rows={5} spellCheck={false} autoComplete="off" />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Key passphrase" htmlFor="monitor-mtls-passphrase" hint="Only if the private key is encrypted.">
                        <Input id="monitor-mtls-passphrase" name="mtlsPassphrase" type="password" maxLength={INPUT_LIMITS.monitorAuthSecret} autoComplete="new-password" placeholder={monitor?.authView.hasPassphrase ? "Leave blank to keep current" : "Optional"} />
                      </Field>
                    </div>
                    <Field label="CA certificate" htmlFor="monitor-mtls-ca" hint="Optional. Trust this CA for the server certificate instead of the system roots.">
                      <Textarea id="monitor-mtls-ca" name="mtlsCa" defaultValue={monitor?.authView.ca ?? ""} maxLength={INPUT_LIMITS.monitorPem} placeholder="-----BEGIN CERTIFICATE-----" className="font-mono" rows={4} spellCheck={false} />
                    </Field>
                  </div>
                )}
                {authType === "HEADER" && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Header name" htmlFor="monitor-auth-header">
                      <Input id="monitor-auth-header" name="authHeaderName" defaultValue={monitor?.authHeaderName ?? ""} maxLength={INPUT_LIMITS.monitorAuthHeaderName} placeholder="Header name (e.g. X-Api-Key)" />
                    </Field>
                    <Field label="Header value" htmlFor="monitor-auth-secret">
                      <Input id="monitor-auth-secret" name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder={editing && monitor?.hasAuthSecret ? "Leave blank to keep current" : "Header value"} />
                    </Field>
                  </div>
                )}
              </SubSection>
            </FormCard>
          )}

          {kind === "PORT" && checkCertificate && (
            <FormCard title="TLS certificate">
              <Field label="Warn before expiry (days)" htmlFor="monitor-ssl-warn" hint={`Marks the monitor down once the certificate has fewer than this many days left. Leave blank for the organization default (${expiryDefaults.certDays} days, set in Settings).`} className="sm:max-w-xs">
                <Input id="monitor-ssl-warn" name="sslWarnDays" type="number" min={1} max={365} defaultValue={monitor?.sslWarnDays ?? ""} placeholder={`${expiryDefaults.certDays} (default)`} />
              </Field>
              <CheckRow name="ignoreTls" defaultChecked={monitor ? !monitor.verifyTls : false} label="Ignore TLS/SSL errors" hint="Still read the expiry date of a self-signed, expired or mismatched certificate instead of failing the check." className="sm:max-w-md" />
            </FormCard>
          )}
          {type === "DNS" && (
            <FormCard title="DNS assertion">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="DNS record type" htmlFor="monitor-dns-type">
                  <Select id="monitor-dns-type" aria-label="DNS record type" name="dnsRecordType" defaultValue={monitor?.dnsRecordType ?? "A"}>
                    {["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((record) => <option key={record} value={record}>{record}</option>)}
                  </Select>
                </Field>
                <Field label="Expected value" htmlFor="monitor-dns-value">
                  <Input id="monitor-dns-value" name="dnsExpectedValue" defaultValue={monitor?.dnsExpectedValue ?? ""} maxLength={INPUT_LIMITS.url} placeholder="Expected value (optional)" />
                </Field>
              </div>
            </FormCard>
          )}
          {kind === "JOB" && (
            <>
              <FormCard title="Heartbeat grace">
                <Field label="Grace period (seconds)" htmlFor="monitor-grace" hint="The heartbeat becomes late after its interval plus this grace period." className="sm:max-w-xs">
                  <Input id="monitor-grace" name="heartbeatGraceSec" type="number" min={0} max={86400} defaultValue={monitor?.heartbeatGraceSec ?? 60} />
                </Field>
                {!editing && <p className="text-xs leading-5 text-ink-dim">After you add the monitor, open it with the pencil icon and choose Create or rotate heartbeat URL. Your job then calls that URL (GET or POST) at least once per interval.</p>}
              </FormCard>
              <FormCard title="Heartbeat URL security" description="The URL is a secret link, which already works like a password. Add credentials to also require them on every call.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Require authentication" htmlFor="monitor-auth-type">
                    <Select id="monitor-auth-type" aria-label="Require authentication" name="authType" value={authType} onChange={(e) => setAuthType(e.target.value)}>
                      <option value="NONE">None, the secret link only</option>
                      <option value="BASIC">HTTP Basic: username and password</option>
                      <option value="BEARER">Bearer token</option>
                    </Select>
                  </Field>
                </div>
                {authType === "BASIC" && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Username" htmlFor="monitor-auth-user" required>
                      <Input id="monitor-auth-user" name="authUsername" defaultValue={monitor?.authUsername ?? ""} maxLength={INPUT_LIMITS.monitorAuthUsername} autoComplete="off" placeholder="Username your job will send" required />
                    </Field>
                    <Field label="Password" htmlFor="monitor-auth-secret" hint="Stored encrypted and never shown again.">
                      <Input id="monitor-auth-secret" name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" autoComplete="new-password" placeholder={editing && monitor?.hasAuthSecret && monitor.authType === "BASIC" ? "Leave blank to keep current" : "Password your job will send"} />
                    </Field>
                  </div>
                )}
                {authType === "BEARER" && (
                  <Field label="Bearer token" htmlFor="monitor-auth-secret" hint="Your job sends it as Authorization: Bearer <token>. Stored encrypted and never shown again." className="sm:max-w-md">
                    <Input id="monitor-auth-secret" name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" autoComplete="new-password" placeholder={editing && monitor?.hasAuthSecret && monitor.authType === "BEARER" ? "Leave blank to keep current" : "Token your job will send"} />
                  </Field>
                )}
              </FormCard>
            </>
          )}

          {isHttpLike && (
            <FormCard title="Request options" description="How the monitor reaches the target and how its result is judged.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Proxy" htmlFor="monitor-proxy" hint="Send this monitor's requests through a proxy. Without one it connects directly.">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Select id="monitor-proxy" aria-label="Proxy" name="proxyId" value={proxyId} onChange={(e) => setProxyId(e.target.value)}>
                        <option value="">No proxy</option>
                        {proxies.map((proxy) => <option key={proxy.id} value={proxy.id}>{proxyLabel(proxy)}{proxy.enabled ? "" : " (disabled)"}</option>)}
                      </Select>
                    </div>
                    {createProxy && <ProxyManager proxies={proxies} createProxy={createProxy} />}
                  </div>
                </Field>
                <Field label="IP family" htmlFor="monitor-ip-family" hint="Auto uses the Happy Eyeballs algorithm to pick between IPv4 and IPv6.">
                  <Select id="monitor-ip-family" aria-label="IP family" name="ipFamily" defaultValue={monitor?.ipFamily ?? "AUTO"}>
                    <option value="AUTO">Auto select</option>
                    <option value="IPV4">IPv4 only</option>
                    <option value="IPV6">IPv6 only</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Stored as verifyTls, the inverse of this box. */}
                <CheckRow name="ignoreTls" defaultChecked={monitor ? !monitor.verifyTls : false} label="Ignore TLS/SSL errors" hint="Accept expired, self-signed and mismatched certificates on HTTPS targets." />
                <CheckRow name="cacheBuster" defaultChecked={monitor?.cacheBuster} label="Skip caches" hint="Adds a random _sh query parameter to every request so a CDN cannot answer for the origin." />
                <CheckRow name="saveErrorResponse" defaultChecked={monitor?.saveErrorResponse} label="Save HTTP error response for notifications" hint="Stores the first 4 KB of the response when a check fails. It appears in check history and is sent to webhooks and custom HTTP destinations as response. It may contain sensitive data." />
                <CheckRow name="upsideDown" defaultChecked={monitor?.upsideDown} label="Upside-down mode" hint="Flips the status: if the service is reachable, it is DOWN." />
              </div>
            </FormCard>
          )}

          {type !== "HEARTBEAT" && (
            <FormCard title="Expiry monitoring" description="Get warned before a certificate or domain lapses. Warnings go to your webhooks and destinations, never to page subscribers.">
              {isHttpLike && (
                <div className="space-y-3">
                  <CheckRow name="certExpiryNotify" defaultChecked={monitor?.certExpiryNotify} label="Certificate expiry notification" hint={`HTTPS targets only. Warns ${expiryDefaults.certDays} days in advance by default; change the number of days in the Settings of this organization.`} />
                  <Field label="Days in advance for this monitor" htmlFor="monitor-ssl-warn-http" hint="Optional. Overrides the organization default for this monitor." className="sm:max-w-xs">
                    <Input id="monitor-ssl-warn-http" name="sslWarnDays" type="number" min={1} max={365} defaultValue={monitor?.sslWarnDays ?? ""} placeholder={`${expiryDefaults.certDays} (default)`} />
                  </Field>
                </div>
              )}
              <div className="space-y-2">
                <CheckRow name="domainExpiryNotify" defaultChecked={domain.ok ? monitor?.domainExpiryNotify : false} disabled={!domain.ok} label="Domain name expiry notification" hint={`Checked once a day with the registry (RDAP). Warns ${expiryDefaults.domainDays} days in advance by default; change the number of days in Settings.`} />
                {!domain.ok && target.trim() && (
                  <p className="text-xs leading-5 text-warn-fg">The host &quot;{hostname ?? target.trim()}&quot; is not a candidate for domain expiry monitoring because {domain.reason}.</p>
                )}
              </div>
            </FormCard>
          )}

          <FormCard title="Thresholds and failure status" description="How many checks it takes to change state, and what a failure does to the service.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {!isHttpLike && (
                <Field label="Timeout (ms)" htmlFor="monitor-timeout">
                  <Input id="monitor-timeout" name="timeoutMs" type="number" min={100} max={60000} defaultValue={monitor?.timeoutMs ?? 10000} placeholder="Timeout (ms)" />
                </Field>
              )}
              <Field label="Fails before down" htmlFor="monitor-fail" hint="Consecutive failed checks before the monitor is marked down.">
                <Input id="monitor-fail" name="failThreshold" type="number" min={1} max={20} defaultValue={monitor?.failThreshold ?? 1} placeholder="Fails before down" />
              </Field>
              <Field label="OKs before recovered" htmlFor="monitor-recover" hint="Consecutive successful checks before the monitor is marked recovered.">
                <Input id="monitor-recover" name="recoverThreshold" type="number" min={1} max={20} defaultValue={monitor?.recoverThreshold ?? 1} placeholder="OKs before recovered" />
              </Field>
            </div>
            <Field label="Service status on failure" htmlFor="monitor-down-status" className="sm:max-w-sm">
              <Select id="monitor-down-status" aria-label="Service status on failure" name="downStatus" defaultValue={monitor?.downStatus ?? "MAJOR_OUTAGE"}>
                {COMPONENT_STATUSES.filter((s: ComponentStatus) => s !== "OPERATIONAL" && s !== "UNDER_MAINTENANCE").map((s) => (
                  <option key={s} value={s}>
                    On failure, set service to: {COMPONENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </FormCard>

          <FormCard title="Automated actions" description="What happens automatically when the monitor changes state.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CheckRow name="actionFlipStatus" defaultChecked={monitor?.actionFlipStatus ?? true} label="Update service status automatically" />
              <CheckRow name="actionRecordMetric" defaultChecked={monitor?.actionRecordMetric ?? true} label="Record response-time metric" />
              <CheckRow name="actionAutoIncident" defaultChecked={monitor?.actionAutoIncident} label="Auto open/close incident" hint="Creates an incident when the monitor goes down and resolves it when the monitor recovers." />
              <CheckRow name="actionNotify" defaultChecked={monitor?.actionNotify} label="Notify subscribers" hint="Sends a notification to all subscribers on this page when the monitor status changes." />
            </div>
          </FormCard>
        </div>
      </div>

      <FormActionBar hint={testHint} submitLabel={editing ? "Save monitor" : "Add monitor"} cancelHref={cancelHref} leadingAction={testAction && (
        <Button type="button" variant="secondary" data-button-guard="off" loading={testing} disabled={kind === "JOB"} title={kind === "JOB" ? "Send a heartbeat after saving to test this monitor" : "Run one check with the current settings without saving"} onClick={(event) => {
          const form = event.currentTarget.form;
          if (!form || !form.reportValidity() || testing) return;
          const data = new FormData(form);
          setTestResult(null);
          startTest(async () => {
            try { setTestResult(await testAction(data)); }
            catch { setTestResult({ ok: false, message: "Could not reach the server. Try again.", latencyMs: null, statusCode: null }); }
          });
        }}>{testing ? "Testing…" : "Test"}</Button>
      )} />
    </PlatformActionForm>
  );
}
