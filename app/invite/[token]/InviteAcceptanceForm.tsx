"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteAcceptanceForm({
  token,
  hasPassword,
  passwordMinimum,
}: {
  token: string;
  hasPassword: boolean;
  passwordMinimum: number;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasPassword && password !== confirmation) {
      setError("Passwords do not match");
      return;
    }
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/accept-invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error?.message ?? "Invitation could not be accepted");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Unable to accept the invitation. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <div>
        <label htmlFor="invite-password" className="text-xs font-semibold text-[var(--fg)]">
          {hasPassword ? "Confirm your existing password" : "Create a password"}
        </label>
        <input
          id="invite-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          minLength={hasPassword ? 1 : passwordMinimum}
          maxLength={1024}
          autoComplete={hasPassword ? "current-password" : "new-password"}
          required
          className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm"
        />
      </div>
      {!hasPassword && (
        <div>
          <label htmlFor="invite-confirmation" className="text-xs font-semibold text-[var(--fg)]">
            Confirm password
          </label>
          <input
            id="invite-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            type="password"
            minLength={passwordMinimum}
            maxLength={1024}
            autoComplete="new-password"
            required
            className="mt-1 w-full border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm"
          />
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[var(--red)]">{error}</p>}
      <button
        disabled={pending}
        className="w-full bg-[var(--cyan)] py-3 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50"
      >
        {pending ? "Accepting…" : "Accept invitation"}
      </button>
    </form>
  );
}
