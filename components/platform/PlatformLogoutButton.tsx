"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlatformLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/platform-logout", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error?.message ?? body.error ?? "Unable to sign out");
        return;
      }
      router.push("/platform/login");
      router.refresh();
    } catch {
      setError("Unable to sign out. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void logout()}
        className="font-medium text-[var(--cyan)] hover:underline disabled:opacity-50"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
