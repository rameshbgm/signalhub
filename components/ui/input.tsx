import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        "flex h-10 w-full rounded-[0.2rem] border border-[var(--input-overlay-border)] bg-[var(--input-overlay-bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--placeholder-overlay)] focus:border-[var(--input-overlay-border-focus)] focus:ring-2 focus:ring-[var(--cyan-soft)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
});
