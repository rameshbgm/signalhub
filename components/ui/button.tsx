import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "secondary" | "soft" | "outline" | "ghost" | "destructive" | "link";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-semibold outline-none transition-[background-color,border-color,color,box-shadow] duration-150 ease-soft focus-visible:ring-[3px] focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";

/** Class string for anything that should look like a Button, such as a <Link>. */
export function buttonVariants({ variant = "default", size = "default", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    base,
    variant === "default" && "bg-primary text-on-primary shadow-primary hover:bg-primary-hover active:bg-primary-hover",
    variant === "secondary" && "border border-line-strong bg-surface text-ink shadow-card hover:border-ink-dim/40 hover:bg-sunken [&_svg]:text-ink-soft",
    variant === "soft" && "bg-primary-soft text-primary-ink hover:bg-primary/15",
    variant === "outline" && "border border-line-strong bg-transparent text-ink hover:bg-sunken [&_svg]:text-ink-soft",
    variant === "ghost" && "text-ink-soft hover:bg-sunken hover:text-ink",
    variant === "destructive" && "bg-danger text-white shadow-card hover:bg-danger-fg focus-visible:ring-danger/30",
    variant === "link" && "h-auto rounded-chip p-0 text-primary-ink underline-offset-4 hover:underline",
    size === "default" && variant !== "link" && "h-9 px-3.5",
    size === "sm" && variant !== "link" && "h-8 px-3 text-xs",
    size === "lg" && variant !== "link" && "h-11 px-5 text-[0.9375rem]",
    size === "icon" && "size-9 p-0",
    className,
  );
}

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
      className={buttonVariants({ variant, size, className })}
    >
      {loading && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {children}
    </button>
  );
});
