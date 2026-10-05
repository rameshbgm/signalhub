import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A labelled form control with optional hint and error text. */
export function Field({ label, htmlFor, hint, error, required, className, children }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: ReactNode; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-danger">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs leading-5 text-ink-dim">{hint}</p>}
      {error && <p role="alert" className="text-xs leading-5 text-danger-fg">{error}</p>}
    </div>
  );
}
