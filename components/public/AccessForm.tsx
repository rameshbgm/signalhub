"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccessForm({ slug, type, returnTo }: { slug: string; type: "PRIVATE" | "AUDIENCE"; returnTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/v1/access/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push(returnTo);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? "Access denied");
      }
    } catch {
      setError("Unable to verify access. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-[var(--surface)] border border-[var(--line)] p-6 w-full max-w-sm space-y-3">
      <h1 className="font-mono text-lg font-semibold mb-1 text-[var(--fg)]">
        {type === "PRIVATE" ? "This page is password protected" : "Sign in to view your status page"}
      </h1>
      {type === "AUDIENCE" && (
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-none px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:outline-none focus:border-[var(--cyan)]"
          required
        />
      )}
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="Password"
        className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-none px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:outline-none focus:border-[var(--cyan)]"
        required
      />
      {error && <p className="text-xs text-[var(--red)]">{error}</p>}
      <button
        disabled={loading}
        className="w-full bg-[var(--cyan)] text-[var(--on-cyan)] rounded-none py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Checking..." : "Continue"}
      </button>
    </form>
  );
}
