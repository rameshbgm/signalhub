"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";

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
      const response = await fetch("/api/admin/feed-tokens", {
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
      const response = await fetch(`/api/admin/feed-tokens?id=${id}`, { method: "DELETE" });
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
    <div className="space-y-3">
      <form onSubmit={create} className="space-y-3 border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--fg-soft)]">
            Token name
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]" />
          </label>
          <label className="text-xs text-[var(--fg-soft)]">
            Optional expiry
            <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]" />
          </label>
        </div>
        {components.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-xs text-[var(--fg-soft)]">Component scope (leave empty for all)</legend>
            <div className="grid max-h-32 gap-1 overflow-y-auto border border-[var(--line)] bg-[var(--bg)] p-2 sm:grid-cols-2">
              {components.map((component) => (
                <label key={component.id} className="flex items-center gap-2 text-xs text-[var(--fg-soft)]">
                  <input
                    type="checkbox"
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
        <button disabled={pending} className="bg-[var(--cyan)] px-4 py-2 text-sm font-medium text-[var(--on-cyan)] disabled:opacity-50">
          {pending ? "Creating…" : "Create signed feed token"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-[var(--red)]">{error}</p>}
      {secret && (
        <div role="status" className="space-y-2 border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-3 text-sm">
          <p className="font-semibold text-[var(--fg)]">Copy these feed URLs now. The token will not be shown again.</p>
          {(["rss", "atom"] as const).map((format) => (
            <div key={format} className="flex flex-wrap items-center gap-2">
              <span className="mr-2 font-mono text-xs uppercase text-[var(--fg-soft)]">{format}</span>
              <code className="break-all select-all text-xs text-[var(--fg)]">{feedUrl(format)}</code>
              <CopyButton
                value={feedUrl(format)}
                label={`Copy ${format.toUpperCase()} URL`}
                className="text-xs font-semibold text-[var(--cyan)] disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      )}
      <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--surface)]">
        {tokens.map((token) => (
          <div key={token.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-medium text-[var(--fg)]">{token.name}</span>
              <code className="ml-2 text-xs text-[var(--fg-soft)]">{token.label}</code>
              <p className="mt-1 text-xs text-[var(--fg-dim)]">
                {token.expiresAt ? `expires ${new Date(token.expiresAt).toLocaleString()}` : "no expiry"}
                {token.lastUsedAt ? ` · last used ${new Date(token.lastUsedAt).toLocaleString()}` : " · never used"}
              </p>
            </div>
            <button disabled={pending} onClick={() => revoke(token.id)} className="self-start border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] disabled:opacity-50 sm:self-auto">Revoke</button>
          </div>
        ))}
        {tokens.length === 0 && <p className="p-3 text-sm text-[var(--fg-dim)]">No active feed tokens.</p>}
      </div>
    </div>
  );
}
