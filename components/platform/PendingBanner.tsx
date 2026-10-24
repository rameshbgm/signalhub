"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { confirmDeployment, revertDeployment } from "@/app/platform/(protected)/deployment/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** A change that could lock you out is on trial: keep it, or it undoes itself. */
export function PendingBanner({ revertAt, keys, canManage }: { revertAt: string; keys: string[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((new Date(revertAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((new Date(revertAt).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) { clearInterval(timer); setTimeout(() => router.refresh(), 2500); }
    }, 1000);
    return () => clearInterval(timer);
  }, [revertAt, router]);

  const run = (action: () => Promise<string>) => startTransition(async () => { toast(await action(), "ok"); router.refresh(); });
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <Alert tone="warn" title={remaining > 0 ? `Keep these settings? Undoes itself in ${clock}` : "Time is up: restoring the previous settings"}>
      <p>
        You changed {keys.join(", ")}. If you can read this page, the change did not lock you out. Press Keep to make it permanent; otherwise the previous values return automatically.
      </p>
      {canManage && remaining > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => run(confirmDeployment)} disabled={pending}><Timer aria-hidden size={14} />Keep</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => run(revertDeployment)} disabled={pending}>Undo now</Button>
        </div>
      )}
    </Alert>
  );
}
