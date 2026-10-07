"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { SecretField } from "@/components/admin/SecretReveal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

type Endpoint = {
  id: string;
  url: string;
  secretLabel: string;
  verifiedAt: string | null;
};

export function WebhookEndpointManager({
  pageId,
  endpoints,
}: {
  pageId: string;
  endpoints: Endpoint[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending("create");
    setError(null);
    setSecret(null);

    try {
      const response = await fetchWithTimeout("/api/admin/webhook-endpoints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId, url }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message ?? "Webhook verification failed");
        return;
      }
      setUrl("");
      setSecret(data.secret);
      router.refresh();
    } catch {
      setError("Unable to verify the webhook. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  async function test(id: string) {
    if (pending) return;
    setPending(id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetchWithTimeout(`/api/admin/webhook-endpoints/${id}/test`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error?.message ?? "Test delivery failed");
      else setNotice("Signed test event delivered (event type status.test).");
    } catch {
      setError("Unable to send the test event. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  async function mutate(id: string, action: "rotate" | "delete") {
    if (pending) return;
    const confirmed = await confirm(
      action === "rotate"
        ? "Rotate this signing secret? The previous secret stops working immediately."
        : "Delete this webhook endpoint and stop all future deliveries?",
      { confirmLabel: action === "rotate" ? "Rotate secret" : "Delete endpoint" }
    );
    if (!confirmed) return;
    setPending(id);
    setError(null);
    setSecret(null);

    try {
      const response = await fetchWithTimeout(
        action === "rotate"
          ? `/api/admin/webhook-endpoints/${id}/rotate`
          : `/api/admin/webhook-endpoints?id=${id}`,
        { method: action === "rotate" ? "POST" : "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message ?? "Webhook update failed");
        return;
      }
      if (action === "rotate") setSecret(data.token);
      router.refresh();
    } catch {
      setError("Unable to update the webhook. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="ok" role="status">{notice}</Alert>}
      {secret && (
        <Alert tone="warn" role="status" title="Copy this signing secret now. It will not be shown again.">
          <SecretField value={secret} copyLabel="Copy secret" className="mt-3" />
        </Alert>
      )}
      {/* Every caller already places this inside a card. */}
      <div className="space-y-5">
          <div className="max-w-2xl">
            <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="HTTPS webhook URL" htmlFor="webhook-url" className="min-w-0 flex-1">
                <Input
                  id="webhook-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  type="url"
                  placeholder="https://example.com/webhook"
                  className="font-mono"
                  required
                />
              </Field>
              <Button type="submit" loading={pending === "create"}>
                {pending === "create" ? "Verifying…" : "Verify and add"}
              </Button>
            </form>
            <p className="mt-2 text-xs leading-5 text-ink-dim">SignalHub verifies the endpoint before saving it, then signs every delivery with the secret shown once after it is added.</p>
          </div>
          {endpoints.length === 0 ? (
            <EmptyState icon={Webhook} hue="teal" title="No webhook endpoints yet" description="Add an HTTPS endpoint to receive signed status events." className="border-0 bg-transparent py-6" />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {endpoints.map((endpoint) => (
                <li key={endpoint.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-xs font-medium text-ink">{endpoint.url}</span>
                      <StatusBadge tone={endpoint.verifiedAt ? "ok" : "warn"}>{endpoint.verifiedAt ? "Verified" : "Unverified"}</StatusBadge>
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-dim">signature: {endpoint.secretLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" size="sm" disabled={Boolean(pending)} onClick={() => test(endpoint.id)}>
                      <Send aria-hidden size={14} />
                      Send test
                    </Button>
                    <Button type="button" variant="secondary" size="sm" disabled={Boolean(pending)} onClick={() => mutate(endpoint.id, "rotate")}>
                      <RefreshCw aria-hidden size={14} />
                      Rotate
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className={DANGER_GHOST} disabled={Boolean(pending)} onClick={() => mutate(endpoint.id, "delete")}>
                      <Trash2 aria-hidden size={14} />
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>
      {confirmDialog}
    </div>
  );
}

const DANGER_GHOST = "hover:!bg-danger-bg hover:!text-danger-fg [&_svg]:!text-ink-dim hover:[&_svg]:!text-danger-fg";
