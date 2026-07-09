"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/platform-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/platform/orgs");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Login failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-6">
      <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-800 p-8">
        <Link href="/" className="font-mono text-xs uppercase tracking-widest text-gray-400">
          statuspage · platform
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-white">Platform admin</h1>
        <p className="mt-1 text-sm text-gray-400">Internal console — spans all organizations.</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-gray-400"
            required
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-gray-400"
            required
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-md bg-white py-2.5 text-sm font-semibold text-gray-900 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
