"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error?.message ?? body.error ?? "Unable to sign out");
        return;
      }
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setError("Unable to sign out. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (compact) {
    return (
      <span className="relative shrink-0">
        <button
          type="button"
          disabled={pending}
          onClick={() => void logout()}
          aria-label={pending ? "Signing out" : "Sign out"}
          title={error ?? "Sign out"}
          className={`flex h-8 w-8 items-center justify-center border border-[var(--line)] text-[var(--fg-soft)] transition-colors hover:border-[var(--red)]/50 hover:bg-[var(--red-soft)] hover:text-[var(--red)] disabled:opacity-50 ${className}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {error && (
          <span role="alert" className="absolute right-0 top-full z-30 mt-1 w-56 border border-[var(--red)]/30 bg-[var(--surface-raised)] p-2 text-xs text-[var(--red)]">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => void logout()}
        className={`flex w-full items-center justify-between border border-transparent px-2 py-2 text-left font-mono text-xs font-medium text-[var(--fg-soft)] transition-colors hover:border-[var(--red)]/30 hover:bg-[var(--red-soft)] hover:text-[var(--red)] disabled:opacity-50 ${className}`}
      >
        <span>{pending ? "Signing out…" : "Sign out"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {error && <p role="alert" className="px-2 pt-1 text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
