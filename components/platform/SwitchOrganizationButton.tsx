"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SwitchOrganizationButton({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchOrganization() {
    setPending(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/auth/switch-org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId: organizationId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? "Organization could not be opened");
      router.push("/organization");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Organization could not be opened");
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        onClick={switchOrganization}
        disabled={pending}
        variant="outline"
        size="sm"
        loading={pending}
      >
        {pending ? "Opening…" : "Open organization"}
      </Button>
      {error && <p role="alert" className="mt-1 text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}
