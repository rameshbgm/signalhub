"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@acme.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="bg-white border rounded-lg p-6 w-full max-w-sm space-y-3 shadow-sm">
        <h1 className="text-lg font-semibold mb-1">Sign in to your dashboard</h1>
        <p className="text-xs text-gray-400 mb-2">Demo credentials: admin@acme.test / password123</p>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full border rounded-md px-3 py-2 text-sm" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="w-full border rounded-md px-3 py-2 text-sm" required />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button disabled={loading} className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-xs text-gray-400 text-center">
          New here?{" "}
          <a href="/signup" className="text-blue-600 hover:underline">
            Create an organization
          </a>
        </p>
      </form>
    </div>
  );
}
