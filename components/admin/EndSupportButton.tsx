"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EndSupportButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-[var(--red)]">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const response = await fetch("/api/auth/end-support", { method: "POST" });
            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              throw new Error(body.error?.message ?? body.error ?? "Unable to end support");
            }
            router.push("/platform/orgs");
            router.refresh();
          } catch (endError) {
            setError(endError instanceof Error ? endError.message : "Unable to end support");
          } finally {
            setPending(false);
          }
        }}
        className="border border-[var(--amber)]/50 px-2.5 py-1 text-xs font-semibold text-[var(--amber)] disabled:opacity-50"
      >
        {pending ? "Ending…" : "End support and return"}
      </button>
    </div>
  );
}
