"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";
import { useToast } from "@/components/ui/toast";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RotateCw } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ScimTokenManager({ connectionId }: { connectionId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToast("danger", error);
  const [confirm, confirmDialog] = useConfirm();

  async function rotate() {
    if (!(await confirm("Rotate the SCIM token? The previous token will stop working immediately.", { confirmLabel: "Rotate token" }))) return;
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
    <div className="space-y-3">
      <Button
        type="button"
        onClick={() => void rotate()}
        disabled={pending}
        variant="outline"
        size="sm"
        loading={pending}
      >
        {!pending && <RotateCw aria-hidden size={14} />}
        {pending ? "Rotating…" : "Rotate SCIM token"}
      </Button>
      {secret && (
        <Alert tone="warn" title="Copy this token now. It will not be shown again.">
          <code className="mt-1 block break-all rounded-control bg-surface px-3 py-2 font-mono text-xs text-ink">{secret}</code>
          <CopyButton value={secret} label="Copy token" errorClassName="text-xs text-danger-fg" className="mt-2" />
        </Alert>
      )}
      {confirmDialog}
    </div>
  );
}
