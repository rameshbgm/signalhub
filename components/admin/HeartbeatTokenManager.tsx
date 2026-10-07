"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";
import { useToast } from "@/components/ui/toast";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { SecretField } from "@/components/admin/SecretReveal";

export function HeartbeatTokenManager({ monitorId }: { monitorId: string }) {
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
      setUrl(data.url);
    } catch {
      setError("Unable to rotate the token. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-control bg-sunken/60 p-3 text-xs">
      {url ? (
        <Alert tone="warn" title="Copy this URL now. It will not be shown again."><SecretField value={url} copyLabel="Copy URL" className="mt-2" /></Alert>
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
