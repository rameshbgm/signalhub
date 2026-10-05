"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Button } from "@/components/ui/button";

export function ScimTokenManager({ connectionId }: { connectionId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    if (!window.confirm("Rotate the SCIM token? The previous token will stop working immediately.")) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(`/api/platform/identity-connections/${connectionId}/scim-token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? "SCIM token rotation failed");
      setSecret(body.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "SCIM token rotation failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={() => void rotate()}
        disabled={pending}
        variant="outline"
        size="sm"
        loading={pending}
      >
        {pending ? "Rotating…" : "Rotate SCIM token"}
      </Button>
      {secret && (
        <div className="border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-2 text-xs">
          <p className="font-semibold">Copy this token now. It will not be shown again.</p>
          <code className="mt-1 block break-all">{secret}</code>
          <CopyButton value={secret} label="Copy token" className="mt-1 font-semibold text-[var(--cyan)]" />
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
