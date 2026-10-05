import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "soft" | "outline" | "ghost" | "destructive" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps, ref) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      data-ui-button="true"
      data-variant={variant}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-semibold outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-soft focus-visible:ring-4 focus-visible:ring-primary/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
        variant === "default" && "bg-gradient-to-b from-primary to-primary-hover text-on-primary shadow-primary hover:from-primary-hover hover:to-primary-hover hover:shadow-raised",
        variant === "secondary" && "border border-line-strong bg-surface text-ink shadow-card hover:border-primary/40 hover:bg-primary-soft hover:text-primary-ink [&_svg]:text-primary",
        variant === "soft" && "bg-primary-soft text-primary-ink hover:bg-primary/15",
        variant === "outline" && "border border-line-strong bg-transparent text-ink hover:border-primary/50 hover:bg-primary-soft hover:text-primary-ink [&_svg]:text-primary",
        variant === "ghost" && "text-ink-soft hover:bg-sunken hover:text-ink [&_svg]:text-primary",
        variant === "destructive" && "bg-danger text-white shadow-card hover:brightness-110 focus-visible:ring-danger/25",
        variant === "link" && "h-auto rounded-chip p-0 text-primary underline-offset-4 hover:underline active:scale-100",
        size === "default" && variant !== "link" && "min-h-10 px-4 py-2",
        size === "sm" && variant !== "link" && "min-h-8 px-3 py-1.5 text-xs",
        size === "lg" && variant !== "link" && "min-h-12 px-6 py-3 text-base",
        size === "icon" && "size-10 p-0",
        className,
      )}
    >
      {loading && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {children}
    </button>
  );
});
