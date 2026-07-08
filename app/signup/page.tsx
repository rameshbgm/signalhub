"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgName, name, email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Signup failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form onSubmit={submit} className="bg-white border rounded-lg p-6 w-full max-w-sm space-y-3 shadow-sm">
        <h1 className="text-lg font-semibold mb-1">Create your organization</h1>
        <p className="text-xs text-gray-400 mb-2">Free plan: 1 status page, 3 team members. Upgrade anytime.</p>
        <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organization name" className="w-full border rounded-md px-3 py-2 text-sm" required minLength={2} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full border rounded-md px-3 py-2 text-sm" required />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Work email" className="w-full border rounded-md px-3 py-2 text-sm" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password (min 8 characters)" className="w-full border rounded-md px-3 py-2 text-sm" required minLength={8} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button disabled={loading} className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50">
          {loading ? "Creating..." : "Create organization"}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Already have an account?{" "}
          <Link href="/admin/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
