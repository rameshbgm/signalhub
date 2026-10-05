"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
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
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={disabled || pending}
      loading={pending}
      title={title}
      className={className}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
