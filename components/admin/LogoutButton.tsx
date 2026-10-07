"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";
import { useToast } from "@/components/ui/toast";

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
  useToast("danger", error);

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
          className={`size-9 hover:bg-danger-bg hover:text-danger-fg [&_svg]:text-current ${className}`}
        >
          <LogOut aria-hidden size={16} />
        </Button>
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
        className={`w-full !justify-between px-3 text-ink-soft hover:bg-danger-bg hover:text-danger-fg [&_svg]:text-current ${className}`}
      >
        <span>{pending ? "Signing out…" : "Sign out"}</span>
        <LogOut aria-hidden size={16} />
      </Button>
    </div>
  );
}
