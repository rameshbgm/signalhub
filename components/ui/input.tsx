import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "flex w-full rounded-control border-2 border-transparent bg-sunken px-3.5 text-sm font-medium text-ink outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-soft placeholder:font-normal placeholder:text-ink-dim hover:bg-primary-soft/70 focus:border-primary/60 focus:bg-surface focus:shadow-[0_0_0_5px_rgb(124_58_237/0.12)] aria-[invalid=true]:border-danger/60 aria-[invalid=true]:bg-danger-bg/40 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} {...props} className={cn(fieldClass, "h-11 py-2", className)} />;
});
