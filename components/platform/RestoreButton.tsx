"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreFromHistory } from "@/app/platform/(protected)/deployment/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function RestoreButton({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
      const result = await restoreFromHistory(auditId);
      toast(result.message, result.ok ? "ok" : "danger");
      router.refresh();
    })}>
      Restore the earlier values
    </Button>
  );
}
