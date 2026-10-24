import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

/** Submit and cancel in a bar pinned to the bottom edge of a full-page form, so they never need a scroll. */
export function FormActionBar({ hint, submitLabel, cancelHref }: { hint: string; submitLabel: string; cancelHref: string }) {
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
