"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Button } from "@/components/ui/button";

export function HeartbeatTokenManager({ monitorId }: { monitorId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setUrl(data.url);
    } catch {
      setError("Unable to rotate the token. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 border border-[var(--line)] bg-[var(--bg)] p-2 text-xs">
      {url ? (
        <div className="space-y-2">
          <p className="text-[var(--amber)]">Copy this URL now. It will not be shown again.</p>
          <code className="block break-all text-[var(--fg)]">{url}</code>
          <CopyButton
            value={url}
            label="Copy URL"
            className="border border-[var(--line)] px-2 py-1 disabled:opacity-50"
          />
        </div>
      ) : (
        <Button
          type="button"
          loading={pending}
          onClick={() => void rotate()}
          variant="link"
          size="sm"
          className="h-auto px-0 py-0 text-[var(--cyan)]"
        >
          {pending ? "Creating heartbeat URL…" : "Create or rotate heartbeat URL"}
        </Button>
      )}
      {error && <p role="alert" className="mt-1 text-[var(--red)]">{error}</p>}
    </div>
  );
}
