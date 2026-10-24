import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "flex w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink shadow-card outline-none transition-[border-color,box-shadow] duration-150 ease-soft placeholder:text-ink-dim hover:border-ink-dim/50 focus:border-primary focus:ring-[3px] focus:ring-primary/15 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15 disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-70";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} {...props} className={cn(fieldClass, "h-9 py-1.5", className)} />;
});
