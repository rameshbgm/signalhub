"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccessForm({ slug, type }: { slug: string; type: "PRIVATE" | "AUDIENCE" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/v1/access/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(`/${slug}`);
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Access denied");
    }
  }

  return (
    <form onSubmit={submit} className="bg-white border rounded-lg p-6 w-full max-w-sm space-y-3">
      <h1 className="text-lg font-semibold mb-1">{type === "PRIVATE" ? "This page is password protected" : "Sign in to view your status page"}</h1>
      {type === "AUDIENCE" && (
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full border rounded-md px-3 py-2 text-sm" required />
      )}
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="w-full border rounded-md px-3 py-2 text-sm" required />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button disabled={loading} className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50">
        {loading ? "Checking..." : "Continue"}
      </button>
    </form>
  );
}
