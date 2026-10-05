"use client";

import { useId, useState, type ButtonHTMLAttributes } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  errorClassName = "text-xs text-danger-fg",
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
      <Button
        {...buttonProps}
        type="button"
        data-button-guard="off"
        disabled={disabled || pending}
        loading={pending}
        variant="secondary"
        size="sm"
        aria-describedby={error ? errorId : undefined}
        onClick={() => void copy()}
        className={className}
      >
        {!pending && (copied ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />)}
        {pending ? copyingLabel : copied ? copiedLabel : label}
      </Button>
      {error && (
        <span id={errorId} role="alert" className={errorClassName}>
          {error}
        </span>
      )}
    </>
  );
}
