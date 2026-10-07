"use client";

import { useState, type ReactNode } from "react";
import { PlatformActionForm } from "@/components/platform/PlatformActionForm";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckRow } from "@/components/admin/operate-ui";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";
import { INPUT_LIMITS } from "@/lib/input-limits";

const MONITOR_TYPES = ["HTTP", "KEYWORD", "TCP", "TLS", "ICMP", "DNS", "HEARTBEAT"] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-card border border-line p-4">
      <legend className="px-1.5 text-sm font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

export function MonitorForm({
  action,
  components,
}: {
  action: (formData: FormData) => void;
  components: { id: string; name: string }[];
}) {
  const [type, setType] = useState<(typeof MONITOR_TYPES)[number]>("HTTP");
  const [authType, setAuthType] = useState("NONE");
  const isUrlBased = type === "HTTP" || type === "KEYWORD";
  const isHttpLike = type === "HTTP" || type === "KEYWORD";

  return (
    <PlatformActionForm action={action} successMessage="Monitor added" className="space-y-5 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monitor name" htmlFor="monitor-name" required>
          <Input id="monitor-name" name="name" maxLength={INPUT_LIMITS.title} placeholder="Monitor name" required />
        </Field>
        <Field label="Monitor type" htmlFor="monitor-type">
          <Select id="monitor-type" aria-label="Monitor type" name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {MONITOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        {type !== "HEARTBEAT" && (
          <Field label="Target" htmlFor="monitor-target" className="sm:col-span-2" required>
            <Input
              id="monitor-target"
              name="target" maxLength={INPUT_LIMITS.url}
              placeholder={isUrlBased ? "https://example.com/health" : "host.example.com"}
              className="font-mono"
              required
            />
          </Field>
        )}
        {type === "HEARTBEAT" && <Input type="hidden" name="target" maxLength={INPUT_LIMITS.url} value="inbound-heartbeat" />}

        {type === "TCP" && (
          <Field label="Port" htmlFor="monitor-port" required>
            <Input id="monitor-port" name="port" type="number" placeholder="Port" required />
          </Field>
        )}

        <Field label="Component" htmlFor="monitor-component">
          <Select id="monitor-component" aria-label="Component" name="componentId">
            <option value="">Not tied to a component</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {isHttpLike && (
        <Section title="HTTP request">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="HTTP method" htmlFor="monitor-method">
              <Select id="monitor-method" aria-label="HTTP method" name="method" defaultValue="GET">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="HEAD">HEAD</option>
              </Select>
            </Field>
            <Field label="Expected status" htmlFor="monitor-status-range">
              <Input id="monitor-status-range" name="expectedStatusRange" maxLength={INPUT_LIMITS.monitorStatusRange} defaultValue="200-299" placeholder="Expected status (e.g. 200-299)" />
            </Field>
            <Field label="Timeout (ms)" htmlFor="monitor-timeout-http">
              <Input id="monitor-timeout-http" name="timeoutMs" type="number" defaultValue={10000} placeholder="Timeout (ms)" />
            </Field>
          </div>
          <Field label="Custom headers" htmlFor="monitor-headers" hint="A JSON object.">
            <Textarea id="monitor-headers" name="requestHeaders" maxLength={INPUT_LIMITS.monitorRequestHeaders} placeholder='Custom headers JSON, e.g. {"X-Api-Key":"abc"}' className="font-mono" rows={2} />
          </Field>
          <Field label="Request body" htmlFor="monitor-body">
            <Textarea id="monitor-body" name="requestBody" maxLength={INPUT_LIMITS.monitorRequestBody} placeholder="POST body (optional)" className="font-mono" rows={2} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Body must contain" htmlFor="monitor-keyword" hint="Monitor is marked down if the response body does not contain this text.">
              <Input id="monitor-keyword" name="keywordMatch" maxLength={INPUT_LIMITS.monitorKeyword} placeholder="Body must contain (optional)" />
            </Field>
            <Field label="Body must not contain" htmlFor="monitor-keyword-absent" hint="Monitor is marked down if the response body contains this text.">
              <Input id="monitor-keyword-absent" name="keywordAbsent" maxLength={INPUT_LIMITS.monitorKeyword} placeholder="Body must NOT contain (optional)" />
            </Field>
          </div>
        </Section>
      )}

      {type === "TLS" && (
        <Section title="TLS certificate">
          <Field label="Warn before expiry (days)" htmlFor="monitor-ssl-warn" hint="Triggers a warning once the certificate has fewer than this many days left before expiry." className="sm:max-w-xs">
            <Input id="monitor-ssl-warn" name="sslWarnDays" type="number" defaultValue={14} placeholder="Warn if expiring within N days" />
          </Field>
        </Section>
      )}
      {type === "DNS" && (
        <Section title="DNS assertion">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="DNS record type" htmlFor="monitor-dns-type">
              <Select id="monitor-dns-type" aria-label="DNS record type" name="dnsRecordType" defaultValue="A">
                {["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((record) => <option key={record} value={record}>{record}</option>)}
              </Select>
            </Field>
            <Field label="Expected value" htmlFor="monitor-dns-value">
              <Input id="monitor-dns-value" name="dnsExpectedValue" maxLength={INPUT_LIMITS.url} placeholder="Expected value (optional)" />
            </Field>
          </div>
        </Section>
      )}
      {type === "HEARTBEAT" && (
        <Section title="Heartbeat grace">
          <Field label="Grace period (seconds)" htmlFor="monitor-grace" hint="The heartbeat becomes late after its interval plus this grace period." className="sm:max-w-xs">
            <Input id="monitor-grace" name="heartbeatGraceSec" type="number" defaultValue={60} />
          </Field>
        </Section>
      )}

      {isUrlBased && (
        <Section title="Security and authentication">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Authentication type" htmlFor="monitor-auth-type">
              <Select id="monitor-auth-type" aria-label="Authentication type" name="authType" value={authType} onChange={(e) => setAuthType(e.target.value)}>
                <option value="NONE">No authentication</option>
                <option value="BASIC">Basic auth</option>
                <option value="BEARER">Bearer token</option>
                <option value="HEADER">Custom header</option>
              </Select>
            </Field>
            <CheckRow name="verifyTls" defaultChecked label="Verify TLS certificate" className="sm:self-end" />
            {/* Read only when the box above is unchecked: FormData.get returns the first value. */}
            <input type="hidden" name="verifyTls" value="off" />
          </div>
          {authType === "BASIC" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username" htmlFor="monitor-auth-user">
                <Input id="monitor-auth-user" name="authUsername" maxLength={INPUT_LIMITS.monitorAuthUsername} placeholder="Username" />
              </Field>
              <Field label="Password" htmlFor="monitor-auth-secret">
                <Input id="monitor-auth-secret" name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder="Password" />
              </Field>
            </div>
          )}
          {authType === "BEARER" && (
            <Field label="Bearer token" htmlFor="monitor-auth-secret">
              <Input id="monitor-auth-secret" name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder="Bearer token" />
            </Field>
          )}
          {authType === "HEADER" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Header name" htmlFor="monitor-auth-header">
                <Input id="monitor-auth-header" name="authHeaderName" maxLength={INPUT_LIMITS.monitorAuthHeaderName} placeholder="Header name (e.g. X-Api-Key)" />
              </Field>
              <Field label="Header value" htmlFor="monitor-auth-secret">
                <Input id="monitor-auth-secret" name="authSecret" maxLength={INPUT_LIMITS.monitorAuthSecret} type="password" placeholder="Header value" />
              </Field>
            </div>
          )}
        </Section>
      )}

      <Section title="Scheduling and thresholds">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Interval (seconds)" htmlFor="monitor-interval" hint="How often the monitor polls the target.">
            <Input id="monitor-interval" name="intervalSec" type="number" defaultValue={300} placeholder="Interval (sec)" />
          </Field>
          {!isHttpLike && (
            <Field label="Timeout (ms)" htmlFor="monitor-timeout">
              <Input id="monitor-timeout" name="timeoutMs" type="number" defaultValue={10000} placeholder="Timeout (ms)" />
            </Field>
          )}
          <Field label="Fails before down" htmlFor="monitor-fail" hint="Consecutive failed checks before the monitor is marked down.">
            <Input id="monitor-fail" name="failThreshold" type="number" defaultValue={1} placeholder="Fails before down" />
          </Field>
          <Field label="OKs before recovered" htmlFor="monitor-recover" hint="Consecutive successful checks before the monitor is marked recovered.">
            <Input id="monitor-recover" name="recoverThreshold" type="number" defaultValue={1} placeholder="OKs before recovered" />
          </Field>
        </div>
        <Field label="Component status on failure" htmlFor="monitor-down-status" className="sm:max-w-sm">
          <Select id="monitor-down-status" aria-label="Component status on failure" name="downStatus" defaultValue="MAJOR_OUTAGE">
            {COMPONENT_STATUSES.filter((s: ComponentStatus) => s !== "OPERATIONAL" && s !== "UNDER_MAINTENANCE").map((s) => (
              <option key={s} value={s}>
                On failure, set component to: {COMPONENT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monitor group" htmlFor="monitor-group">
          <Input id="monitor-group" name="groupName" maxLength={INPUT_LIMITS.monitorGroup} placeholder="Monitor group (optional)" />
        </Field>
        <Field label="Tags" htmlFor="monitor-tags">
          <Input id="monitor-tags" name="tags" placeholder="Tags, comma separated" />
        </Field>
      </div>

      <Section title="Automated actions">
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckRow name="actionFlipStatus" defaultChecked label="Flip component status" />
          <CheckRow name="actionRecordMetric" defaultChecked label="Record response-time metric" />
          <CheckRow name="actionAutoIncident" label="Auto open/close incident" hint="Creates an incident when the monitor goes down and resolves it when the monitor recovers." />
          <CheckRow name="actionNotify" label="Notify subscribers" hint="Sends a notification to all subscribers on this page when the monitor status changes." />
        </div>
      </Section>

      <div className="flex justify-end">
        <Button type="submit">Add monitor</Button>
      </div>
    </PlatformActionForm>
  );
}
