"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
      const response = await fetchWithTimeout(`/api/auth/accept-invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error?.message ?? "Invitation could not be accepted");
        return;
      }
      router.push("/organization");
      router.refresh();
    } catch {
      setError("Unable to accept the invitation. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <Field label={hasPassword ? "Confirm your existing password" : "Create a password"} htmlFor="invite-password" hint={hasPassword ? undefined : `Use at least ${passwordMinimum} characters.`}>
        <Input
          id="invite-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          minLength={hasPassword ? 1 : passwordMinimum}
          maxLength={1024}
          autoComplete={hasPassword ? "current-password" : "new-password"}
          required
          className="h-12 px-4"
        />
      </Field>
      {!hasPassword && (
        <Field label="Confirm password" htmlFor="invite-confirmation">
          <Input
            id="invite-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            type="password"
            minLength={passwordMinimum}
            maxLength={1024}
            autoComplete="new-password"
            required
            className="h-12 px-4"
          />
        </Field>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" loading={pending} size="lg" className="w-full">
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
    </form>
  );
}
