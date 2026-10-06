import Link from "next/link";
import type { ReactNode } from "react";
import { Activity } from "lucide-react";

/** Centred form layout shared by the invite, change-password, and suspended screens; mirrors the sign-in page. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-wash px-6 py-8 text-ink sm:px-12">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-prism opacity-10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-gradient-to-br from-cyan-300 to-primary opacity-10 blur-3xl" />
      <Link href="/" className="relative flex w-fit items-center gap-2.5 rounded-control text-base font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
        <span aria-hidden="true" className="inline-grid size-9 place-items-center rounded-[0.5rem] bg-prism text-white shadow-primary">
          <Activity size={18} strokeWidth={2.5} />
        </span>
        SignalHub
      </Link>
      <div className="relative m-auto w-full max-w-sm animate-rise rounded-card border border-line bg-surface p-7 shadow-raised">{children}</div>
    </main>
  );
}
