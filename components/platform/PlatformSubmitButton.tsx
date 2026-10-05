"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function PlatformSubmitButton({
  children,
  pendingLabel = "Working…",
  confirmMessage,
  className = "",
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  confirmMessage?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      loading={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      title={title}
      className={`${className} disabled:cursor-wait disabled:opacity-50`}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
