"use client";

import { useState } from "react";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";
import { HelpTip } from "@/components/HelpTip";

const MONITOR_TYPES = ["HTTP", "KEYWORD", "TCP", "TLS", "ICMP", "DNS", "HEARTBEAT"] as const;

const inputClass =
  "border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)]";
const inputClassXs =
  "border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--fg)] outline-none placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)]";

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
    <form action={action} className="space-y-4 border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" placeholder="Monitor name" className={`${inputClass} w-full`} required />
        <select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className={`${inputClass} w-full`}>
          {MONITOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {type !== "HEARTBEAT" && <input
          name="target"
          placeholder={isUrlBased ? "https://example.com/health" : "host.example.com"}
          className={`${inputClass} w-full sm:col-span-2`}
          required
        />}
        {type === "HEARTBEAT" && <input type="hidden" name="target" value="inbound-heartbeat" />}

        {type === "TCP" && <input name="port" type="number" placeholder="Port" className={`${inputClass} w-full`} required />}

        <select name="componentId" className={`${inputClass} w-full`}>
          <option value="">Not tied to a component</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isHttpLike && (
        <fieldset className="space-y-2 border border-[var(--line)] p-3">
          <legend className="px-1 font-mono text-xs uppercase tracking-wide text-[var(--fg-dim)]">HTTP request</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            <select name="method" defaultValue="GET" className={`${inputClassXs} w-full`}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="HEAD">HEAD</option>
            </select>
            <input name="expectedStatusRange" defaultValue="200-299" placeholder="Expected status (e.g. 200-299)" className={`${inputClassXs} w-full`} />
            <input name="timeoutMs" type="number" defaultValue={10000} placeholder="Timeout (ms)" className={`${inputClassXs} w-full`} />
          </div>
          <textarea name="requestHeaders" placeholder='Custom headers JSON, e.g. {"X-Api-Key":"abc"}' className={`${inputClassXs} w-full`} rows={2} />
          <textarea name="requestBody" placeholder="POST body (optional)" className={`${inputClassXs} w-full`} rows={2} />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-1.5">
              <input name="keywordMatch" placeholder="Body must contain (optional)" className={`${inputClassXs} w-full`} />
              <HelpTip text="Monitor is marked down if the response body does not contain this text." />
            </div>
            <div className="flex items-center gap-1.5">
              <input name="keywordAbsent" placeholder="Body must NOT contain (optional)" className={`${inputClassXs} w-full`} />
              <HelpTip text="Monitor is marked down if the response body contains this text." />
            </div>
          </div>
        </fieldset>
      )}

      {type === "TLS" && (
        <fieldset className="border border-[var(--line)] p-3">
          <legend className="px-1 font-mono text-xs uppercase tracking-wide text-[var(--fg-dim)]">TLS certificate</legend>
          <div className="flex items-center gap-1.5">
            <input name="sslWarnDays" type="number" defaultValue={14} placeholder="Warn if expiring within N days" className={`${inputClassXs} w-full sm:w-auto`} />
            <HelpTip text="Triggers a warning once the certificate has fewer than this many days left before expiry." />
          </div>
        </fieldset>
      )}
      {type === "DNS" && (
        <fieldset className="border border-[var(--line)] p-3">
          <legend className="px-1 font-mono text-xs uppercase tracking-wide text-[var(--fg-dim)]">DNS assertion</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <select name="dnsRecordType" defaultValue="A" className={`${inputClassXs} w-full`}>
              {["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((record) => <option key={record} value={record}>{record}</option>)}
            </select>
            <input name="dnsExpectedValue" placeholder="Expected value (optional)" className={`${inputClassXs} w-full`} />
          </div>
        </fieldset>
      )}
      {type === "HEARTBEAT" && (
        <fieldset className="border border-[var(--line)] p-3">
          <legend className="px-1 font-mono text-xs uppercase tracking-wide text-[var(--fg-dim)]">Heartbeat grace</legend>
          <input name="heartbeatGraceSec" type="number" defaultValue={60} className={`${inputClassXs} w-full`} />
          <p className="mt-1 text-xs text-[var(--fg-dim)]">The heartbeat becomes late after its interval plus this grace period.</p>
        </fieldset>
      )}

      {isUrlBased && (
        <fieldset className="space-y-2 border border-[var(--line)] p-3">
          <legend className="px-1 font-mono text-xs uppercase tracking-wide text-[var(--fg-dim)]">Security / authentication</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <select name="authType" value={authType} onChange={(e) => setAuthType(e.target.value)} className={`${inputClassXs} w-full`}>
              <option value="NONE">No authentication</option>
              <option value="BASIC">Basic auth</option>
              <option value="BEARER">Bearer token</option>
              <option value="HEADER">Custom header</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-[var(--fg-soft)]">
              <input name="verifyTls" type="checkbox" defaultChecked /> Verify TLS certificate
            </label>
          </div>
          {authType === "BASIC" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="authUsername" placeholder="Username" className={`${inputClassXs} w-full`} />
              <input name="authSecret" type="password" placeholder="Password" className={`${inputClassXs} w-full`} />
            </div>
          )}
          {authType === "BEARER" && <input name="authSecret" type="password" placeholder="Bearer token" className={`${inputClassXs} w-full`} />}
          {authType === "HEADER" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="authHeaderName" placeholder="Header name (e.g. X-Api-Key)" className={`${inputClassXs} w-full`} />
              <input name="authSecret" type="password" placeholder="Header value" className={`${inputClassXs} w-full`} />
            </div>
          )}
        </fieldset>
      )}

      <fieldset className="space-y-2 border border-[var(--line)] p-3">
        <legend className="px-1 font-mono text-xs uppercase tracking-wide text-[var(--fg-dim)]">Scheduling &amp; thresholds</legend>
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="flex items-center gap-1.5">
            <input name="intervalSec" type="number" defaultValue={300} placeholder="Interval (sec)" className={`${inputClassXs} w-full`} />
            <HelpTip text="How often the monitor polls the target, in seconds." />
          </div>
          {!isHttpLike && <input name="timeoutMs" type="number" defaultValue={10000} placeholder="Timeout (ms)" className={`${inputClassXs} w-full`} />}
          <div className="flex items-center gap-1.5">
            <input name="failThreshold" type="number" defaultValue={1} placeholder="Fails before down" className={`${inputClassXs} w-full`} />
            <HelpTip text="Number of consecutive failed checks required before the monitor is marked down." />
          </div>
          <div className="flex items-center gap-1.5">
            <input name="recoverThreshold" type="number" defaultValue={1} placeholder="OKs before recovered" className={`${inputClassXs} w-full`} />
            <HelpTip text="Number of consecutive successful checks required before the monitor is marked recovered." />
          </div>
        </div>
        <select name="downStatus" defaultValue="MAJOR_OUTAGE" className={`${inputClassXs} w-full`}>
          {COMPONENT_STATUSES.filter((s: ComponentStatus) => s !== "OPERATIONAL" && s !== "UNDER_MAINTENANCE").map((s) => (
            <option key={s} value={s}>
              On failure, set component to: {COMPONENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </fieldset>

      <div className="grid gap-2 sm:grid-cols-2">
        <input name="groupName" placeholder="Monitor group (optional)" className={`${inputClassXs} w-full`} />
        <input name="tags" placeholder="Tags, comma separated" className={`${inputClassXs} w-full`} />
      </div>

      <fieldset className="border border-[var(--line)] p-3">
        <legend className="px-1 font-mono text-xs uppercase tracking-wide text-[var(--fg-dim)]">Automated actions</legend>
        <div className="grid gap-2 text-xs text-[var(--fg-soft)] sm:grid-cols-2">
          <label className="flex items-center gap-2">
            <input name="actionFlipStatus" type="checkbox" defaultChecked /> Flip component status
          </label>
          <label className="flex items-center gap-2">
            <input name="actionRecordMetric" type="checkbox" defaultChecked /> Record response-time metric
          </label>
          <label className="flex items-center gap-2">
            <input name="actionAutoIncident" type="checkbox" /> Auto open/close incident
            <HelpTip text="Automatically creates an incident when the monitor goes down and resolves it when the monitor recovers." />
          </label>
          <label className="flex items-center gap-2">
            <input name="actionNotify" type="checkbox" /> Notify subscribers
            <HelpTip text="Sends a notification to all subscribers on this page when the monitor status changes." />
          </label>
        </div>
      </fieldset>

      <button className="bg-[var(--cyan)] px-4 py-2 text-sm font-medium text-[var(--on-cyan)] transition-opacity hover:opacity-90">Add Monitor</button>
    </form>
  );
}
