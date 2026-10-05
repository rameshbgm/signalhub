import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Radio({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="radio"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer border border-[var(--line-bright)] bg-[var(--input-overlay-bg)] accent-[var(--cyan)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
