"use client";

import { useFormStatus } from "react-dom";

export function PlatformSubmitButton({
  children,
  pendingLabel = "Working…",
  confirmMessage,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  confirmMessage?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      className={`${className} disabled:cursor-wait disabled:opacity-50`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
