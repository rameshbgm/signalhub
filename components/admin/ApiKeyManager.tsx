"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";

const API_SCOPES = [
  "status.read",
  "components.read",
  "components.write",
  "incidents.read",
  "incidents.write",
  "metrics.read",
  "metrics.write",
  "analytics.read",
] as const;

export function ApiKeyCreator({ pages }: { pages: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["status.read"]);
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [allowedCidrs, setAllowedCidrs] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          scopes,
          pageIds: pageIds.length ? pageIds : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          allowedCidrs: allowedCidrs.trim()
            ? allowedCidrs.split(",").map((value) => value.trim()).filter(Boolean)
            : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message ?? "API key creation failed");
        return;
      }
      setSecret(data.token);
      setName("");
      router.refresh();
    } catch {
      setError("Unable to create the API key. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-4 border border-[var(--line)] bg-[var(--surface)] p-4">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Key name (e.g. CI pipeline)"
          className="flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none"
          required
        />
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-[var(--fg-soft)]">Permissions</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(event) =>
                    setScopes((current) =>
                      event.target.checked
                        ? [...current, scope]
                        : current.filter((item) => item !== scope)
                    )
                  }
                />
                <code>{scope}</code>
              </label>
            ))}
          </div>
        </fieldset>
        {pages.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-[var(--fg-soft)]">
              Page access (none selected means all pages)
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {pages.map((page) => (
                <label key={page.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={pageIds.includes(page.id)}
                    onChange={(event) =>
                      setPageIds((current) =>
                        event.target.checked
                          ? [...current, page.id]
                          : current.filter((id) => id !== page.id)
                      )
                    }
                  />
                  {page.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--fg-soft)]">
            Expires at (optional)
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-[var(--fg-soft)]">
            Allowed IPv4/CIDRs (optional, comma-separated)
            <input
              value={allowedCidrs}
              onChange={(event) => setAllowedCidrs(event.target.value)}
              placeholder="10.0.0.0/8, 203.0.113.10"
              className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button disabled={pending || scopes.length === 0} className="bg-[var(--cyan)] px-4 py-2 text-sm font-medium text-[var(--on-cyan)] disabled:opacity-50">
          {pending ? "Generating…" : "Generate Key"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-[var(--red)]">{error}</p>}
      {secret && (
        <div role="status" className="border border-[var(--amber)]/40 bg-[var(--amber-soft)] p-3 text-sm">
          <p className="font-semibold text-[var(--fg)]">Copy this key now. It will not be shown again.</p>
          <code className="mt-2 block break-all select-all text-[var(--fg)]">{secret}</code>
          <CopyButton
            value={secret}
            label="Copy key"
            className="mt-2 text-xs font-semibold text-[var(--cyan)] disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}

export function ApiKeyActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(kind: "rotate" | "revoke") {
    if (pending) return;
    const message = kind === "rotate"
      ? "Rotate this key? Existing integrations will stop working immediately."
      : "Revoke this key? This cannot be undone.";
    if (!window.confirm(message)) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        kind === "rotate" ? `/api/admin/api-keys/${id}/rotate` : `/api/admin/api-keys?id=${id}`,
        { method: kind === "rotate" ? "POST" : "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error?.message ?? `API key ${kind} failed`);
        return;
      }
      if (kind === "rotate") setSecret(data.token);
      router.refresh();
    } catch {
      setError(`Unable to ${kind} the API key. Check your connection and try again.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {secret && (
        <>
          <code className="max-w-full break-all bg-[var(--bg)] px-1 text-xs">{secret}</code>
          <CopyButton value={secret} label="Copy new key" className="text-xs text-[var(--cyan)] disabled:opacity-50" />
        </>
      )}
      <button disabled={pending} onClick={() => void mutate("rotate")} className="border border-[var(--line)] px-2.5 py-1 text-xs disabled:opacity-50">
        {pending ? "Working…" : "Rotate"}
      </button>
      <button disabled={pending} onClick={() => void mutate("revoke")} className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] disabled:opacity-50">
        Revoke
      </button>
      {error && <span role="alert" className="text-xs text-[var(--red)]">{error}</span>}
    </div>
  );
}
