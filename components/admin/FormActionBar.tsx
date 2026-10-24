import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Submit and cancel in a bar pinned to the bottom edge of a full-page form, so they never need a scroll. */
export function FormActionBar({ hint, submitLabel, cancelHref, leadingAction }: { hint: ReactNode; submitLabel: string; cancelHref: string; leadingAction?: ReactNode }) {
  if (leadingAction) return (
    <div className="sticky bottom-3 z-20 grid grid-cols-[auto_1fr] items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-float lg:grid-cols-[minmax(max-content,1fr)_minmax(0,2fr)_minmax(max-content,1fr)]">
      <div className="justify-self-start">{leadingAction}</div>
      <p role="status" aria-live="polite" className="order-3 col-span-2 min-w-0 break-words text-center text-xs leading-5 text-ink-dim lg:order-none lg:col-span-1">{hint}</p>
      <div className="flex items-center justify-self-end gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>Cancel</Link>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </div>
  );
  return (
    <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-float">
      <p className="min-w-0 text-xs leading-5 text-ink-dim">{hint}</p>
      <div className="flex items-center gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>Cancel</Link>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </div>
  );
}
