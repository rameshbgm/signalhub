"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="max-w-2xl border border-[var(--red)]/40 bg-[var(--red-soft)] p-5">
      <h1 className="font-mono text-lg font-semibold text-[var(--fg)]">
        The platform action could not be completed
      </h1>
      <p className="mt-2 text-sm text-[var(--fg-soft)]">
        {error.message || "The underlying state changed or the operation failed."}
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[10px] text-[var(--fg-dim)]">Reference {error.digest}</p>
      )}
      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          onClick={reset}
          variant="outline"
          size="sm"
          className="text-[var(--cyan)]"
        >
          Reload current state
        </Button>
        <Link href="/organization/platform" className="border border-[var(--line)] px-3 py-2 text-xs font-semibold">
          Platform overview
        </Link>
      </div>
    </div>
  );
}
