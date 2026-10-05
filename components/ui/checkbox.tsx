import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="checkbox"
      className={cn(
        "size-[1.125rem] shrink-0 cursor-pointer rounded-[0.35rem] border border-line-strong bg-surface accent-primary transition-shadow focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
