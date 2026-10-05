import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cn(
        "flex min-h-24 w-full resize-y rounded-[0.2rem] border border-[var(--input-overlay-border)] bg-[var(--input-overlay-bg)] px-3 py-2.5 text-sm leading-6 text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--placeholder-overlay)] focus:border-[var(--input-overlay-border-focus)] focus:ring-2 focus:ring-[var(--cyan-soft)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
});
