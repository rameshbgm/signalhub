import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A labelled on/off toggle. It is a native checkbox underneath, so it submits `on` and works uncontrolled in forms. */
export function Switch({ label, hint, className, ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60", className)}>
      <input {...input} type="checkbox" role="switch" suppressHydrationWarning className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-surface after:shadow-card after:transition-transform after:duration-200 peer-checked:bg-primary peer-checked:after:translate-x-4 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/25"
      />
      <span className="min-w-0">
        <span className="block font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-5 text-ink-dim">{hint}</span>}
      </span>
    </label>
  );
}
