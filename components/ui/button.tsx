import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
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
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[0.2rem] text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0 [&_svg]:transition-colors",
        variant === "default" && "bg-[var(--cyan)] text-[var(--on-cyan)] shadow-[0_6px_16px_rgba(58,189,211,0.16)] hover:-translate-y-px hover:brightness-110 active:translate-y-0 [&_svg]:text-[var(--on-cyan)]",
        variant === "secondary" && "bg-[var(--surface-raised)] text-[var(--fg)] hover:bg-[var(--hover-overlay-strong)] [&_svg]:text-[var(--cyan)]",
        variant === "outline" && "border border-[var(--line-bright)] bg-transparent text-[var(--fg)] hover:border-[var(--cyan)] hover:bg-[var(--cyan-soft)] hover:text-[var(--cyan)] [&_svg]:text-[var(--cyan)]",
        variant === "ghost" && "text-[var(--fg-soft)] hover:bg-[var(--hover-overlay)] hover:text-[var(--fg)] [&_svg]:text-[var(--cyan)]",
        variant === "destructive" && "bg-[var(--red)] text-white hover:brightness-110 [&_svg]:text-white",
        variant === "link" && "h-auto p-0 text-[var(--cyan)] underline-offset-4 hover:underline [&_svg]:text-current",
        size === "default" && "min-h-10 px-4 py-2.5",
        size === "sm" && "min-h-8 px-3 py-1.5 text-xs",
        size === "lg" && "min-h-11 px-5 py-3",
        size === "icon" && "h-10 w-10 p-0",
        className,
      )}
    >
      {loading && <span aria-hidden="true" className="ui-spinner" />}
      {children}
    </button>
  );
});
