import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Radio({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="radio"
      className={cn(
        "size-4 shrink-0 cursor-pointer border border-line-strong bg-surface accent-primary transition-shadow focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
