"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";

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

  async function mutate(id: string, action: "rotate" | "delete") {
    if (pending) return;
    const confirmed = window.confirm(
      action === "rotate"
        ? "Rotate this signing secret? The previous secret stops working immediately."
        : "Delete this webhook endpoint and stop all future deliveries?"
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
    <div className="space-y-3">
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="webhook-url" className="sr-only">HTTPS webhook URL</label>
        <input
          id="webhook-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          type="url"
          placeholder="https://example.com/webhook"
          className="flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
          required
        />
        <button disabled={Boolean(pending)} className="border border-[var(--line-bright)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--fg)] disabled:opacity-50">
          {pending === "create" ? "Verifying…" : "Verify & Add"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-[var(--red)]">{error}</p>}
      {secret && (
        <div role="status" className="border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-3 text-sm">
          <p className="font-semibold text-[var(--fg)]">Copy this signing secret now. It will not be shown again.</p>
          <code className="mt-2 block break-all select-all text-[var(--fg)]">{secret}</code>
          <CopyButton
            value={secret}
            label="Copy secret"
            className="mt-2 text-xs font-semibold text-[var(--cyan)] disabled:opacity-50"
          />
        </div>
      )}
      <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--surface)]">
        {endpoints.map((endpoint) => (
          <div key={endpoint.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--fg)]">{endpoint.url}</p>
              <code className="text-xs text-[var(--fg-soft)]">signature: {endpoint.secretLabel}</code>
            </div>
            <div className="flex gap-2">
              <button disabled={Boolean(pending)} onClick={() => mutate(endpoint.id, "rotate")} className="border border-[var(--line)] px-2.5 py-1 text-xs disabled:opacity-50">Rotate</button>
              <button disabled={Boolean(pending)} onClick={() => mutate(endpoint.id, "delete")} className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] disabled:opacity-50">Delete</button>
            </div>
          </div>
        ))}
        {endpoints.length === 0 && <p className="p-3 text-sm text-[var(--fg-dim)]">No webhook endpoints yet.</p>}
      </div>
    </div>
  );
}
