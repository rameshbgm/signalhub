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
  "group/btn relative isolate inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full text-sm font-semibold tracking-tight outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-soft focus-visible:ring-4 focus-visible:ring-primary/25 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-110";

/* A light sweep across filled buttons on hover. */
const shine =
  "before:pointer-events-none before:absolute before:inset-y-0 before:-left-1/2 before:-z-10 before:w-1/3 before:-skew-x-12 before:bg-white/30 before:opacity-0 before:transition-[left,opacity] before:duration-500 before:ease-soft hover:before:left-[120%] hover:before:opacity-100";

/** Class string for anything that should look like a Button, such as a <Link>. */
export function buttonVariants({ variant = "default", size = "default", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    base,
    variant === "default" && cn("bg-prism text-on-primary shadow-primary hover:-translate-y-px hover:shadow-float hover:[background-position:100%_50%] [transition-property:background-position,box-shadow,transform] [transition-duration:500ms,200ms,200ms]", shine),
    variant === "secondary" && "bg-surface text-ink shadow-card ring-1 ring-inset ring-line-strong hover:-translate-y-px hover:text-primary-ink hover:shadow-raised hover:ring-primary/40 [&_svg]:text-primary",
    variant === "soft" && "bg-primary-soft text-primary-ink hover:bg-primary/15 [&_svg]:text-primary",
    variant === "outline" && "bg-transparent text-ink ring-1 ring-inset ring-line-strong hover:bg-primary-soft hover:text-primary-ink hover:ring-primary/40 [&_svg]:text-primary",
    variant === "ghost" && "text-ink-soft hover:bg-primary-soft hover:text-primary-ink [&_svg]:text-primary",
    variant === "destructive" && cn("bg-gradient-to-r from-rose-500 to-danger text-white shadow-[0_10px_24px_-10px_rgb(239_68_68/0.7)] hover:-translate-y-px focus-visible:ring-danger/25", shine),
    variant === "link" && "h-auto rounded-chip p-0 text-primary-ink underline-offset-4 hover:underline active:scale-100",
    size === "default" && variant !== "link" && "min-h-10 px-5 py-2",
    size === "sm" && variant !== "link" && "min-h-8 px-3.5 py-1.5 text-xs",
    size === "lg" && variant !== "link" && "min-h-12 px-7 py-3 text-base",
    size === "icon" && "size-10 p-0",
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
