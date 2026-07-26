"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4 text-[var(--fg)]">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 border border-[var(--line)] bg-[var(--surface)] p-6 shadow-xl"
      >
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-[var(--cyan)]">Required account setup</p>
          <h1 className="mt-2 font-mono text-2xl font-semibold">Secure your account</h1>
          <p className="mt-2 text-sm text-[var(--fg-soft)]">
            Replace the temporary password and add an email used only for account and operational communication.
          </p>
        </div>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Communication email"
          autoComplete="email"
          className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cyan)]"
          required
        />
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="Temporary password"
          className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cyan)]"
          required
        />
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="New password (14+ characters)"
          minLength={14}
          className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cyan)]"
          required
        />
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Confirm new password"
          minLength={14}
          className="w-full border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cyan)]"
          required
        />
        {error && <p role="alert" className="text-sm text-[var(--red)]">{error}</p>}
        <button
          disabled={loading}
          className="w-full bg-[var(--cyan)] px-4 py-2.5 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save account and continue"}
        </button>
      </form>
    </main>
  );
}
