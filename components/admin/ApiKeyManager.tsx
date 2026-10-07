"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SecretField } from "@/components/admin/SecretReveal";

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
      const response = await fetchWithTimeout("/api/admin/api-keys", {
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
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-5 rounded-control bg-sunken/60 p-4">
        <Field label="Key name" htmlFor="api-key-name" required>
        <Input id="api-key-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. CI pipeline"
          required
        />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Permissions</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm text-ink-soft">
                <Checkbox
                  checked={scopes.includes(scope)}
                  onChange={(event) =>
                    setScopes((current) =>
                      event.target.checked
                        ? [...current, scope]
                        : current.filter((item) => item !== scope)
                    )
                  }
                />
                <code className="font-mono text-xs">{scope}</code>
              </label>
            ))}
          </div>
        </fieldset>
        {pages.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">
              Page access (none selected means all pages)
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {pages.map((page) => (
                <label key={page.id} className="flex items-center gap-2 text-sm text-ink-soft">
                  <Checkbox
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expires at" htmlFor="api-key-expiry" hint="Optional.">
            <Input
              id="api-key-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </Field>
          <Field label="Allowed IPv4/CIDRs" htmlFor="api-key-networks" hint="Optional. Separate entries with commas.">
            <Input
              id="api-key-networks"
              value={allowedCidrs}
              onChange={(event) => setAllowedCidrs(event.target.value)}
              placeholder="10.0.0.0/8, 203.0.113.10"
            />
          </Field>
        </div>
        <div className="flex justify-end"><Button type="submit" loading={pending} disabled={scopes.length === 0}>{pending ? "Generating…" : "Generate key"}</Button></div>
      </form>
      {error && <Alert tone="danger">{error}</Alert>}
      {secret && <Alert tone="warn" title="Copy this key now. It will not be shown again."><SecretField value={secret} copyLabel="Copy key" className="mt-2" /></Alert>}
    </div>
  );
}

export function ApiKeyActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function mutate(kind: "rotate" | "revoke") {
    if (pending) return;
    const message = kind === "rotate"
      ? "Rotate this key? Existing integrations will stop working immediately."
      : "Revoke this key? This cannot be undone.";
    if (!(await confirm(message, { confirmLabel: kind === "rotate" ? "Rotate key" : "Revoke key" }))) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetchWithTimeout(
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
          <SecretField value={secret} copyLabel="Copy new key" className="basis-full" />
        </>
      )}
      <Button type="button" variant="outline" size="sm" loading={pending} onClick={() => void mutate("rotate")}>
        {pending ? "Working…" : "Rotate"}
      </Button>
      <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => void mutate("revoke")}>
        Revoke
      </Button>
      {error && <span role="alert" className="basis-full text-xs text-danger-fg">{error}</span>}
      {confirmDialog}
    </div>
  );
}
