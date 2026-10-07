"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";

/** Like PlatformSubmitButton (pending label, optional confirm prompt) but with a Button variant. */
export function PageSubmitButton({
  children,
  pendingLabel = "Working…",
  confirmMessage,
  variant,
  size,
  className,
  disabled = false,
  title,
}: {
  children: ReactNode;
  pendingLabel?: string;
  confirmMessage?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  title?: string;
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
      title={title}
      className={className}
      onClick={async (event) => {
        if (!confirmMessage) return;
        // Hold the submit, ask in-app, then submit with this button so its name/value still reach the action.
        event.preventDefault();
        const button = event.currentTarget;
        if (await confirm(confirmMessage)) button.form?.requestSubmit(button);
      }}
    >
      {pending ? pendingLabel : children}
    </Button>
    {confirmDialog}
    </>
  );
}
