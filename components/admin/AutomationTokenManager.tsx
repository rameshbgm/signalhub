"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";

export function AutomationTokenManager({
  componentId,
  label,
}: {
  componentId: string;
  label: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    if (pending || !window.confirm("Rotate this automation token? The previous webhook URL will stop working immediately.")) {
      return;
    }
    setPending(true);
    setError(null);

    try {
      const response = await fetchWithTimeout(`/api/admin/components/${componentId}/rotate-token`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message ?? "Token rotation failed");
        return;
      }
      setToken(data.token);
    } catch {
      setError("Unable to rotate the token. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <code className="bg-[var(--surface-raised)] px-1 text-[var(--fg-soft)]">
        {token ? `/api/v1/webhook-component/${token}` : `/api/v1/webhook-component/${label}`}
      </code>
      <button type="button" disabled={pending} onClick={rotate} className="text-xs font-semibold text-[var(--cyan)] disabled:opacity-50">
        {pending ? "Rotating…" : "Rotate"}
      </button>
      {token && (
        <CopyButton
          value={token}
          className="text-xs text-[var(--cyan)] disabled:opacity-50"
        />
      )}
      {error && <span role="alert" className="text-xs text-[var(--red)]">{error}</span>}
    </span>
  );
}
