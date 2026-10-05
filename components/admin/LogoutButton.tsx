"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      const response = await fetchWithTimeout("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error?.message ?? body.error ?? "Unable to sign out");
        return;
      }
      router.replace("/login");
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
        <Button
          type="button"
          disabled={pending}
          onClick={() => void logout()}
          aria-label={pending ? "Signing out" : "Sign out"}
          title={error ?? "Sign out"}
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-none border border-[var(--line)] text-[var(--fg-soft)] transition-colors hover:border-[var(--red)]/50 hover:bg-[var(--red-soft)] hover:text-[var(--red)] ${className}`}
        >
          <LogOut aria-hidden size={15} />
        </Button>
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
      <Button
        type="button"
        disabled={pending}
        onClick={() => void logout()}
        variant="ghost"
        className={`flex w-full items-center justify-between rounded-none border border-transparent px-2 py-2 text-left font-mono text-xs font-medium text-[var(--fg-soft)] transition-colors hover:border-[var(--red)]/30 hover:bg-[var(--red-soft)] hover:text-[var(--red)] ${className}`}
      >
        <span>{pending ? "Signing out…" : "Sign out"}</span>
        <LogOut aria-hidden size={14} />
      </Button>
      {error && <p role="alert" className="px-2 pt-1 text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
