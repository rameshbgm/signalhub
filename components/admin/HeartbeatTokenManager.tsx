"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";
import { useToast } from "@/components/ui/toast";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { SecretField } from "@/components/admin/SecretReveal";

/** A call your job can copy, matching the credentials the monitor requires. */
function exampleCall(url: string, auth: { type: string; username: string | null }) {
  if (auth.type === "BASIC") return `curl -fsS -u '${auth.username ?? "USERNAME"}:YOUR_PASSWORD' '${url}'`;
  if (auth.type === "BEARER") return `curl -fsS -H 'Authorization: Bearer YOUR_TOKEN' '${url}'`;
  return `curl -fsS '${url}'`;
}

export function HeartbeatTokenManager({ monitorId, auth = { type: "NONE", username: null } }: { monitorId: string; auth?: { type: string; username: string | null } }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToast("danger", error);
  const [pending, setPending] = useState(false);

  async function rotate() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetchWithTimeout(`/api/admin/monitors/${monitorId}/rotate-heartbeat`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message ?? "Token rotation failed");
        return;
      }
      // Without NEXT_PUBLIC_APP_URL the server can only return a path; make it a full URL to copy.
      setUrl(typeof data.url === "string" && data.url.startsWith("/") ? `${window.location.origin}${data.url}` : data.url);
    } catch {
      setError("Unable to rotate the token. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-control bg-sunken/60 p-3 text-xs">
      {url ? (
        <Alert tone="warn" title="Copy this URL now. It will not be shown again.">
          <SecretField value={url} copyLabel="Copy URL" className="mt-2" />
          <p className="mt-3 text-xs">Call it from your job, for example:</p>
          <pre className="mt-1 overflow-x-auto rounded-control border border-line bg-surface p-2 font-mono text-xs text-ink">{exampleCall(url, auth)}</pre>
          {auth.type !== "NONE" && <p className="mt-2 text-xs">This monitor also requires {auth.type === "BASIC" ? "the username and password" : "the bearer token"} you set on the edit form; calls without them get a 401.</p>}
        </Alert>
      ) : (
        <Button
          type="button"
          loading={pending}
          onClick={() => void rotate()}
          variant="link"
          size="sm"
          className="h-auto px-0 py-0"
        >
          {pending ? "Creating heartbeat URL…" : "Create or rotate heartbeat URL"}
        </Button>
      )}
    </div>
  );
}
