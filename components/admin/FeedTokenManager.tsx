"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { SecretField } from "@/components/admin/SecretReveal";
import { Rss } from "lucide-react";

type FeedToken = {
  id: string;
  name: string;
  label: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

type Component = { id: string; name: string };

export function FeedTokenManager({
  pageId,
  pageSlug,
  tokens,
  components,
}: {
  pageId: string;
  pageSlug: string;
  tokens: FeedToken[];
  components: Component[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setSecret(null);

    try {
      const response = await fetchWithTimeout("/api/admin/feed-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pageId,
          name,
          componentIds: selected.length ? selected : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message ?? "Feed token creation failed");
        return;
      }
      setName("");
      setExpiresAt("");
      setSelected([]);
      setSecret(data.token);
      router.refresh();
    } catch {
      setError("Unable to create the feed token. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(id: string) {
    if (pending || !window.confirm("Revoke this feed token? Existing feed readers will lose access immediately.")) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetchWithTimeout(`/api/admin/feed-tokens?id=${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message ?? "Feed token revocation failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to revoke the feed token. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const feedUrl = (format: "rss" | "atom") => {
    if (!secret || typeof window === "undefined") return "";
    const url = new URL(`/api/v1/feeds/${encodeURIComponent(pageSlug)}/${format}`, window.location.origin);
    url.searchParams.set("token", secret);
    return url.toString();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="space-y-4 rounded-control bg-sunken/60 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Token name" htmlFor="feed-token-name" required><Input id="feed-token-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></Field>
          <Field label="Expires at" htmlFor="feed-token-expiry" hint="Optional."><Input id="feed-token-expiry" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></Field>
        </div>
        {components.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Service scope</legend>
            <p className="mb-2 text-xs text-ink-dim">Leave every service unchecked to allow access to all services.</p>
            <div className="grid max-h-40 gap-2 overflow-y-auto rounded-control border border-line bg-surface p-3 sm:grid-cols-2">
              {components.map((component) => (
                <label key={component.id} className="flex items-center gap-2 text-sm text-ink-soft">
                  <Checkbox
                    checked={selected.includes(component.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, component.id]
                          : current.filter((id) => id !== component.id)
                      )
                    }
                  />
                  {component.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end"><Button type="submit" loading={pending}>{pending ? "Creating…" : "Create signed feed token"}</Button></div>
      </form>
      {error && <Alert tone="danger">{error}</Alert>}
      {secret && (
        <Alert tone="warn" title="Copy these feed URLs now. The token will not be shown again.">
          {(["rss", "atom"] as const).map((format) => (
            <SecretField key={format} value={feedUrl(format)} copyLabel={`Copy ${format.toUpperCase()} URL`} label={format.toUpperCase()} className="mt-2" />
          ))}
        </Alert>
      )}
      {tokens.length > 0 ? <ul className="space-y-2">
        {tokens.map((token) => (
          <li key={token.id} className="flex flex-col gap-3 rounded-control border border-line px-3.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="font-medium text-ink">{token.name}</span>
              <code className="ml-2 text-xs text-ink-soft">{token.label}</code>
              <p className="mt-1 text-xs text-ink-dim">
                {token.expiresAt ? `expires ${new Date(token.expiresAt).toLocaleString()}` : "no expiry"}
                {token.lastUsedAt ? ` · last used ${new Date(token.lastUsedAt).toLocaleString()}` : " · never used"}
              </p>
            </div>
            <Button type="button" variant="destructive" size="sm" loading={pending} onClick={() => revoke(token.id)} className="self-start sm:self-auto">Revoke</Button>
          </li>
        ))}
      </ul> : <EmptyState icon={Rss} hue="teal" title="No active feed tokens" description="Create a token above to grant access to protected feeds." />}
    </div>
  );
}
