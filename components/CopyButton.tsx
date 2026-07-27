"use client";

import { useId, useState, type ButtonHTMLAttributes } from "react";

type CopyButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onClick" | "type"
> & {
  value: string;
  label?: string;
  copiedLabel?: string;
  copyingLabel?: string;
  errorClassName?: string;
};

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  copyingLabel = "Copying…",
  className,
  errorClassName = "text-xs text-[var(--red)]",
  disabled,
  ...buttonProps
}: CopyButtonProps) {
  const errorId = useId();
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    if (pending) return;
    setPending(true);
    setCopied(false);
    setError(null);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable");
      }
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("Clipboard access was blocked. Select the value and copy it manually.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        {...buttonProps}
        type="button"
        data-button-guard="off"
        disabled={disabled || pending}
        aria-describedby={error ? errorId : undefined}
        onClick={() => void copy()}
        className={className}
      >
        {pending ? copyingLabel : copied ? copiedLabel : label}
      </button>
      {error && (
        <span id={errorId} role="alert" className={errorClassName}>
          {error}
        </span>
      )}
    </>
  );
}
