"use client";

import { useState } from "react";
import { COMPONENT_STATUSES, COMPONENT_STATUS_LABEL, type ComponentStatus } from "@/lib/status";

const MONITOR_TYPES = ["HTTP", "KEYWORD", "TCP", "PING", "SSL"] as const;

export function MonitorForm({
  action,
  components,
}: {
  action: (formData: FormData) => void;
  components: { id: string; name: string }[];
}) {
  const [type, setType] = useState<(typeof MONITOR_TYPES)[number]>("HTTP");
  const [authType, setAuthType] = useState("NONE");
  const isUrlBased = type === "HTTP" || type === "KEYWORD" || type === "SSL";
  const isHttpLike = type === "HTTP" || type === "KEYWORD";

  return (
    <form action={action} className="bg-white border rounded-lg p-4 space-y-4 text-sm">
      <div className="grid sm:grid-cols-2 gap-3">
        <input name="name" placeholder="Monitor name" className="border rounded-md px-3 py-2 text-sm" required />
        <select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className="border rounded-md px-3 py-2 text-sm">
          {MONITOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <input
          name="target"
          placeholder={isUrlBased ? "https://example.com/health" : "host.example.com"}
          className="border rounded-md px-3 py-2 text-sm sm:col-span-2"
          required
        />

        {type === "TCP" && <input name="port" type="number" placeholder="Port" className="border rounded-md px-3 py-2 text-sm" required />}

        <select name="componentId" className="border rounded-md px-3 py-2 text-sm">
          <option value="">Not tied to a component</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isHttpLike && (
        <fieldset className="border rounded-md p-3 space-y-2">
          <legend className="text-xs font-medium text-gray-500 px-1">HTTP request</legend>
          <div className="grid sm:grid-cols-3 gap-2">
            <select name="method" defaultValue="GET" className="border rounded-md px-3 py-2 text-xs">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="HEAD">HEAD</option>
            </select>
            <input name="expectedStatusRange" defaultValue="200-299" placeholder="Expected status (e.g. 200-299)" className="border rounded-md px-3 py-2 text-xs" />
            <input name="timeoutMs" type="number" defaultValue={10000} placeholder="Timeout (ms)" className="border rounded-md px-3 py-2 text-xs" />
          </div>
          <textarea name="requestHeaders" placeholder='Custom headers JSON, e.g. {"X-Api-Key":"abc"}' className="border rounded-md px-3 py-2 text-xs w-full" rows={2} />
          <textarea name="requestBody" placeholder="POST body (optional)" className="border rounded-md px-3 py-2 text-xs w-full" rows={2} />
          <div className="grid sm:grid-cols-2 gap-2">
            <input name="keywordMatch" placeholder="Body must contain (optional)" className="border rounded-md px-3 py-2 text-xs" />
            <input name="keywordAbsent" placeholder="Body must NOT contain (optional)" className="border rounded-md px-3 py-2 text-xs" />
          </div>
        </fieldset>
      )}

      {type === "SSL" && (
        <fieldset className="border rounded-md p-3">
          <legend className="text-xs font-medium text-gray-500 px-1">SSL certificate</legend>
          <input name="sslWarnDays" type="number" defaultValue={14} placeholder="Warn if expiring within N days" className="border rounded-md px-3 py-2 text-xs" />
        </fieldset>
      )}

      {isUrlBased && (
        <fieldset className="border rounded-md p-3 space-y-2">
          <legend className="text-xs font-medium text-gray-500 px-1">Security / authentication</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            <select name="authType" value={authType} onChange={(e) => setAuthType(e.target.value)} className="border rounded-md px-3 py-2 text-xs">
              <option value="NONE">No authentication</option>
              <option value="BASIC">Basic auth</option>
              <option value="BEARER">Bearer token</option>
              <option value="HEADER">Custom header</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input name="verifyTls" type="checkbox" defaultChecked /> Verify TLS certificate
            </label>
          </div>
          {authType === "BASIC" && (
            <div className="grid sm:grid-cols-2 gap-2">
              <input name="authUsername" placeholder="Username" className="border rounded-md px-3 py-2 text-xs" />
              <input name="authSecret" type="password" placeholder="Password" className="border rounded-md px-3 py-2 text-xs" />
            </div>
          )}
          {authType === "BEARER" && <input name="authSecret" type="password" placeholder="Bearer token" className="border rounded-md px-3 py-2 text-xs w-full" />}
          {authType === "HEADER" && (
            <div className="grid sm:grid-cols-2 gap-2">
              <input name="authHeaderName" placeholder="Header name (e.g. X-Api-Key)" className="border rounded-md px-3 py-2 text-xs" />
              <input name="authSecret" type="password" placeholder="Header value" className="border rounded-md px-3 py-2 text-xs" />
            </div>
          )}
        </fieldset>
      )}

      <fieldset className="border rounded-md p-3 space-y-2">
        <legend className="text-xs font-medium text-gray-500 px-1">Scheduling &amp; thresholds</legend>
        <div className="grid sm:grid-cols-4 gap-2">
          <input name="intervalSec" type="number" defaultValue={300} placeholder="Interval (sec)" className="border rounded-md px-3 py-2 text-xs" />
          {!isHttpLike && <input name="timeoutMs" type="number" defaultValue={10000} placeholder="Timeout (ms)" className="border rounded-md px-3 py-2 text-xs" />}
          <input name="failThreshold" type="number" defaultValue={1} placeholder="Fails before down" className="border rounded-md px-3 py-2 text-xs" />
          <input name="recoverThreshold" type="number" defaultValue={1} placeholder="OKs before recovered" className="border rounded-md px-3 py-2 text-xs" />
        </div>
        <select name="downStatus" defaultValue="MAJOR_OUTAGE" className="border rounded-md px-3 py-2 text-xs">
          {COMPONENT_STATUSES.filter((s: ComponentStatus) => s !== "OPERATIONAL").map((s) => (
            <option key={s} value={s}>
              On failure, set component to: {COMPONENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className="border rounded-md p-3">
        <legend className="text-xs font-medium text-gray-500 px-1">Automated actions</legend>
        <div className="grid sm:grid-cols-2 gap-2 text-xs text-gray-600">
          <label className="flex items-center gap-2">
            <input name="actionFlipStatus" type="checkbox" defaultChecked /> Flip component status
          </label>
          <label className="flex items-center gap-2">
            <input name="actionRecordMetric" type="checkbox" defaultChecked /> Record response-time metric
          </label>
          <label className="flex items-center gap-2">
            <input name="actionAutoIncident" type="checkbox" /> Auto open/close incident
          </label>
          <label className="flex items-center gap-2">
            <input name="actionNotify" type="checkbox" /> Notify subscribers
          </label>
        </div>
      </fieldset>

      <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Add Monitor</button>
    </form>
  );
}
