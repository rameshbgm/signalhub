"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Button } from "@/components/ui/button";
import { ComboInput } from "@/components/ui/combo-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckRow } from "@/components/admin/operate-ui";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";
import type { MonitorRow } from "@/lib/postgres/schema";
import { INPUT_LIMITS, MONITOR_TAGS_HINT, MONITOR_TAGS_PATTERN } from "@/lib/input-limits";

const MONITOR_TYPES = ["HTTP", "KEYWORD", "TCP", "TLS", "ICMP", "DNS", "HEARTBEAT"] as const;

/** Monitor fields the form edits. Picked explicitly so stored secrets never reach the browser. */
export type MonitorFormValues = Pick<MonitorRow,
  | "id" | "name" | "type" | "target" | "port" | "componentId" | "method" | "expectedStatusRange" | "timeoutMs"
  | "requestHeaders" | "requestBody" | "keywordMatch" | "keywordAbsent" | "sslWarnDays" | "dnsRecordType"
  | "dnsExpectedValue" | "heartbeatGraceSec" | "verifyTls" | "authType" | "authUsername" | "authHeaderName"
  | "intervalSec" | "failThreshold" | "recoverThreshold" | "downStatus" | "groupName" | "tags"
  | "actionFlipStatus" | "actionRecordMetric" | "actionAutoIncident" | "actionNotify"
> & { hasAuthSecret: boolean };

/** Collapsed-by-default group of advanced fields. Closed sections still submit their inputs. */
function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group rounded-card border border-line" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-card px-4 py-3 text-sm font-semibold text-ink outline-none hover:bg-sunken focus-visible:ring-4 focus-visible:ring-primary/25 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown aria-hidden size={16} className="text-primary transition-transform duration-200 ease-soft group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-line p-4">{children}</div>
    </details>
  );
}

export function MonitorForm({
  action,
  components,
  groups = [],
  monitor,
  onSuccess,
}: {
  action: (formData: FormData) => void;
  components: { id: string; name: string }[];
  /** Existing monitor group names, offered as suggestions; any new name can still be typed. */
  groups?: string[];
  /** When set, the form edits this monitor: its type is fixed and fields start from its values. */
  monitor?: MonitorFormValues;
  onSuccess?: () => void;
}) {
  const [type, setType] = useState<(typeof MONITOR_TYPES)[number]>((monitor?.type as (typeof MONITOR_TYPES)[number]) ?? "HTTP");
  const [authType, setAuthType] = useState(monitor?.authType ?? "NONE");
  const editing = Boolean(monitor);
  const isUrlBased = type === "HTTP" || type === "KEYWORD";
  const isHttpLike = type === "HTTP" || type === "KEYWORD";
  const idp = monitor ? `${monitor.id}-` : "";

  return (
    <PlatformActionForm action={action} successMessage={editing ? "Monitor saved" : "Monitor added"} onSuccess={onSuccess} className="space-y-4 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monitor name" htmlFor={`${idp}monitor-name`} required>
          <Input id={`${idp}monitor-name`} name="name" defaultValue={monitor?.name} maxLength={INPUT_LIMITS.title} placeholder="Monitor name" required />
        </Field>
        <Field label="Monitor type" htmlFor={`${idp}monitor-type`}>
          <Select id={`${idp}monitor-type`} aria-label="Monitor type" name="type" value={type} disabled={editing} onChange={(e) => setType(e.target.value as typeof type)}>
            {MONITOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        {editing && <input type="hidden" name="type" value={type} />}
        {type !== "HEARTBEAT" && (
          <Field label="Target" htmlFor={`${idp}monitor-target`} className="sm:col-span-2" required>
            <Input
              id={`${idp}monitor-target`}
              name="target" defaultValue={monitor?.target} maxLength={INPUT_LIMITS.url}
              placeholder={isUrlBased ? "https://example.com/health" : "host.example.com"}
              className="font-mono"
              required
            />
          </Field>
        )}
        {type === "HEARTBEAT" && <Input type="hidden" name="target" maxLength={INPUT_LIMITS.url} value="inbound-heartbeat" />}

        {type === "TCP" && (
          <Field label="Port" htmlFor={`${idp}monitor-port`} required>
            <Input id={`${idp}monitor-port`} name="port" type="number" defaultValue={monitor?.port ?? undefined} placeholder="Port" required />
          </Field>
        )}

        <Field label="Component" htmlFor={`${idp}monitor-component`}>
          <Select id={`${idp}monitor-component`} aria-label="Component" name="componentId" defaultValue={monitor?.componentId ?? ""}>
            <option value="">Not tied to a component</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Interval (seconds)" htmlFor={`${idp}monitor-interval`} hint="How often the monitor polls the target.">
          <Input id={`${idp}monitor-interval`} name="intervalSec" type="number" min={10} max={86400} defaultValue={monitor?.intervalSec ?? 300} placeholder="Interval (sec)" />
        </Field>
        <Field label="Monitor group" htmlFor={`${idp}monitor-group`}>
          <ComboInput id={`${idp}monitor-group`} name="groupName" options={groups} defaultValue={monitor?.groupName ?? ""} maxLength={INPUT_LIMITS.monitorGroup} autoComplete="off" placeholder="Select or type a group" />
        </Field>
        <Field label="Tags" htmlFor={`${idp}monitor-tags`}>
          <Input id={`${idp}monitor-tags`} name="tags" defaultValue={monitor?.tags?.join(", ") ?? ""} maxLength={INPUT_LIMITS.monitorTags * (INPUT_LIMITS.monitorTag + 2)} pattern={MONITOR_TAGS_PATTERN} title={MONITOR_TAGS_HINT} placeholder="Tags, comma separated" />
        </Field>
      </div>

      {isHttpLike && (
        <Section title="HTTP request" open={type === "KEYWORD"}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="HTTP method" htmlFor={`${idp}monitor-method`}>
              <Select id={`${idp}monitor-method`} aria-label="HTTP method" name="method" defaultValue={monitor?.method ?? "GET"}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="HEAD">HEAD</option>
              </Select>
            </Field>
            <Field label="Expected status" htmlFor={`${idp}monitor-status-range`}>
              <Input id={`${idp}monitor-status-range`} name="expectedStatusRange" maxLength={INPUT_LIMITS.monitorStatusRange} defaultValue={monitor?.expectedStatusRange ?? "200-299"} placeholder="Expected status (e.g. 200-299)" />
            </Field>
            <Field label="Timeout (ms)" htmlFor={`${idp}monitor-timeout-http`}>
              <Input id={`${idp}monitor-timeout-http`} name="timeoutMs" type="number" defaultValue={monitor?.timeoutMs ?? 10000} placeholder="Timeout (ms)" />
            </Field>
          </div>
          <Field label="Custom headers" htmlFor={`${idp}monitor-headers`} hint="A JSON object.">
            <Textarea id={`${idp}monitor-headers`} name="requestHeaders" defaultValue={monitor?.requestHeaders} maxLength={INPUT_LIMITS.monitorRequestHeaders} placeholder='Custom headers JSON, e.g. {"X-Api-Key":"abc"}' className="font-mono" rows={2} />
          </Field>
          <Field label="Request body" htmlFor={`${idp}monitor-body`}>
            <Textarea id={`${idp}monitor-body`} name="requestBody" defaultValue={monitor?.requestBody ?? ""} maxLength={INPUT_LIMITS.monitorRequestBody} placeholder="POST body (optional)" className="font-mono" rows={2} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Body must contain" htmlFor={`${idp}monitor-keyword`} hint="Monitor is marked down if the response body does not contain this text.">
              <Input id={`${idp}monitor-keyword`} name="keywordMatch" defaultValue={monitor?.keywordMatch ?? ""} maxLength={INPUT_LIMITS.monitorKeyword} placeholder="Body must contain (optional)" />
            </Field>
            <Field label="Body must not contain" htmlFor={`${idp}monitor-keyword-absent`} hint="Monitor is marked down if the response body contains this text.">
              <Input id={`${idp}monitor-keyword-absent`} name="keywordAbsent" defaultValue={monitor?.keywordAbsent ?? ""} maxLength={INPUT_LIMITS.monitorKeyword} placeholder="Body must NOT contain (optional)" />
            </Field>
          </div>
        </Section>
      )}

      {type === "TLS" && (
        <Section title="TLS certificate">
          <Field label="Warn before expiry (days)" htmlFor={`${idp}monitor-ssl-warn`} hint="Triggers a warning once the certificate has fewer than this many days left before expiry." className="sm:max-w-xs">
            <Input id={`${idp}monitor-ssl-warn`} name="sslWarnDays" type="number" defaultValue={monitor?.sslWarnDays ?? 14} placeholder="Warn if expiring within N days" />
          </Field>
        </Section>
      )}
      {type === "DNS" && (
        <Section title="DNS assertion">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="DNS record type" htmlFor={`${idp}monitor-dns-type`}>
              <Select id={`${idp}monitor-dns-type`} aria-label="DNS record type" name="dnsRecordType" defaultValue={monitor?.dnsRecordType ?? "A"}>
                {["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((record) => <option key={record} value={record}>{record}</option>)}
              </Select>
            </Field>
            <Field label="Expected value" htmlFor={`${idp}monitor-dns-value`}>
              <Input id={`${idp}monitor-dns-value`} name="dnsExpectedValue" defaultValue={monitor?.dnsExpectedValue ?? ""} maxLength={INPUT_LIMITS.url} placeholder="Expected value (optional)" />
            </Field>
          </div>
        </Section>
      )}
      {type === "HEARTBEAT" && (
        <Section title="Heartbeat grace">
          <Field label="Grace period (seconds)" htmlFor={`${idp}monitor-grace`} hint="The heartbeat becomes late after its interval plus this grace period." className="sm:max-w-xs">
            <Input id={`${idp}monitor-grace`} name="heartbeatGraceSec" type="number" defaultValue={monitor?.heartbeatGraceSec ?? 60} />
          </Field>
        </Section>
      )}

      {isUrlBased && (
        <Section title="Security and authentication">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Authentication type" htmlFor={`${idp}monitor-auth-type`}>
              <Select id={`${idp}monitor-auth-type`} aria-label="Authentication type" name="authType" value={authType} onChange={(e) => setAuthType(e.target.value)}>
                <option value="NONE">No authentication</option>
                <option value="BASIC">Basic auth</option>
                <option value="BEARER">Bearer token</option>
                <option value="HEADER">Custom header</option>
              </Select>
            </Field>
            <CheckRow name="verifyTls" defaultChecked={monitor?.verifyTls ?? true} label="Verify TLS certificate" className="sm:self-end" />
            {/* Read only when the box above is unchecked: FormData.get returns the first value. */}
            <input type="hidden" name="verifyTls" value="off" />
          </div>
          {authType === "BASIC" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username" htmlFor={`${idp}monitor-auth-user`}>
                <Input id={`${idp}monitor-auth-user`} name="authUsername" defaultValue={monitor?.authUsername ?? ""} maxLength={INPUT_LIMITS.monitorAuthUsername} placeholder="Username" />
              </Field>
              <Field label="Password" htmlFor={`${idp}monitor-auth-secret`}>
                <Input id={`${idp}monitor-auth-secret`} name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder={editing && monitor?.hasAuthSecret ? "Leave blank to keep current" : "Password"} />
              </Field>
            </div>
          )}
          {authType === "BEARER" && (
            <Field label="Bearer token" htmlFor={`${idp}monitor-auth-secret`}>
              <Input id={`${idp}monitor-auth-secret`} name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder={editing && monitor?.hasAuthSecret ? "Leave blank to keep current" : "Bearer token"} />
            </Field>
          )}
          {authType === "HEADER" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Header name" htmlFor={`${idp}monitor-auth-header`}>
                <Input id={`${idp}monitor-auth-header`} name="authHeaderName" defaultValue={monitor?.authHeaderName ?? ""} maxLength={INPUT_LIMITS.monitorAuthHeaderName} placeholder="Header name (e.g. X-Api-Key)" />
              </Field>
              <Field label="Header value" htmlFor={`${idp}monitor-auth-secret`}>
                <Input id={`${idp}monitor-auth-secret`} name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder={editing && monitor?.hasAuthSecret ? "Leave blank to keep current" : "Header value"} />
              </Field>
            </div>
          )}
        </Section>
      )}

      <Section title="Thresholds and failure status">
        <div className="grid gap-4 sm:grid-cols-3">
          {!isHttpLike && (
            <Field label="Timeout (ms)" htmlFor={`${idp}monitor-timeout`}>
              <Input id={`${idp}monitor-timeout`} name="timeoutMs" type="number" defaultValue={monitor?.timeoutMs ?? 10000} placeholder="Timeout (ms)" />
            </Field>
          )}
          <Field label="Fails before down" htmlFor={`${idp}monitor-fail`} hint="Consecutive failed checks before the monitor is marked down.">
            <Input id={`${idp}monitor-fail`} name="failThreshold" type="number" defaultValue={monitor?.failThreshold ?? 1} placeholder="Fails before down" />
          </Field>
          <Field label="OKs before recovered" htmlFor={`${idp}monitor-recover`} hint="Consecutive successful checks before the monitor is marked recovered.">
            <Input id={`${idp}monitor-recover`} name="recoverThreshold" type="number" defaultValue={monitor?.recoverThreshold ?? 1} placeholder="OKs before recovered" />
          </Field>
        </div>
        <Field label="Component status on failure" htmlFor={`${idp}monitor-down-status`} className="sm:max-w-sm">
          <Select id={`${idp}monitor-down-status`} aria-label="Component status on failure" name="downStatus" defaultValue={monitor?.downStatus ?? "MAJOR_OUTAGE"}>
            {COMPONENT_STATUSES.filter((s: ComponentStatus) => s !== "OPERATIONAL" && s !== "UNDER_MAINTENANCE").map((s) => (
              <option key={s} value={s}>
                On failure, set component to: {COMPONENT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="Automated actions">
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckRow name="actionFlipStatus" defaultChecked={monitor?.actionFlipStatus ?? true} label="Flip component status" />
          <CheckRow name="actionRecordMetric" defaultChecked={monitor?.actionRecordMetric ?? true} label="Record response-time metric" />
          <CheckRow name="actionAutoIncident" defaultChecked={monitor?.actionAutoIncident} label="Auto open/close incident" hint="Creates an incident when the monitor goes down and resolves it when the monitor recovers." />
          <CheckRow name="actionNotify" defaultChecked={monitor?.actionNotify} label="Notify subscribers" hint="Sends a notification to all subscribers on this page when the monitor status changes." />
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex justify-end border-t border-line bg-surface px-1 pt-3">
        <Button type="submit">{editing ? "Save monitor" : "Add monitor"}</Button>
      </div>
    </PlatformActionForm>
  );
}
