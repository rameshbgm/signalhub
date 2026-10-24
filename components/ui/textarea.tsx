import { forwardRef, type TextareaHTMLAttributes } from "react";
import { fieldClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} {...props} className={cn(fieldClass, "min-h-24 resize-y py-2.5 leading-6", className)} />;
});
