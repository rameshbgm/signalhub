"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/admin/AuthShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function ChangeTemporaryPasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, email }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error?.message ?? "Password change failed");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to change the password. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-3xl font-semibold tracking-tight">Secure your account</h1>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Replace the temporary password and add an email used only for account and operational communication.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Communication email" htmlFor="account-email">
          <Input
            id="account-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Communication email"
            autoComplete="email"
            className="h-12 px-4"
            required
          />
        </Field>
        <Field label="Temporary password" htmlFor="account-current-password">
          <Input
            id="account-current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Temporary password"
            className="h-12 px-4"
            required
          />
        </Field>
        <Field label="New password" htmlFor="account-new-password" hint="Use at least 14 characters.">
          <Input
            id="account-new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password (14+ characters)"
            minLength={14}
            className="h-12 px-4"
            required
          />
        </Field>
        <Field label="Confirm new password" htmlFor="account-confirm-password">
          <Input
            id="account-confirm-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Confirm new password"
            minLength={14}
            className="h-12 px-4"
            required
          />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" loading={loading} size="lg" className="w-full">
          {loading ? "Saving…" : "Save account and continue"}
        </Button>
      </form>
    </AuthShell>
  );
}
