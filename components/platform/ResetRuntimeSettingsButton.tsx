"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { resetDeployment } from "@/app/platform/(protected)/deployment/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

/** Every setting saved here back to its default, with the same checks and Keep-or-undo trial as any change. */
export function ResetRuntimeSettingsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, dialog] = useConfirm();
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={async () => {
          if (!(await confirm("Put every setting on this page back to its default? Values fixed by the environment are not affected."))) return;
          startTransition(async () => {
            const result = await resetDeployment();
            toast(result.message, result.ok ? "ok" : "danger");
            router.refresh();
          });
        }}
      >
        <RotateCcw aria-hidden size={14} />Reset everything to defaults
      </Button>
      {dialog}
    </>
  );
}
