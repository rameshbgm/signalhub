"use client";

import { useFormStatus } from "react-dom";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

export function PlatformSubmitButton({
  children,
  pendingLabel = "Working…",
  confirmMessage,
  className = "",
  disabled = false,
  title,
  variant,
  size,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  confirmMessage?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const { pending } = useFormStatus();
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={disabled || pending}
      loading={pending}
      onClick={async (event) => {
        if (!confirmMessage) return;
        // Hold the submit, ask in-app, then submit with this button so its name/value still reach the action.
        event.preventDefault();
        const button = event.currentTarget;
        if (await confirm(confirmMessage)) button.form?.requestSubmit(button);
      }}
      title={title}
      className={className}
    >
      {pending ? pendingLabel : children}
    </Button>
    {confirmDialog}
    </>
  );
}
