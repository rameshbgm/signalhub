import Link from "next/link";
import type { ReactNode } from "react";
import { Activity } from "lucide-react";

/** Centred form layout shared by the invite, change-password, and suspended screens; mirrors the sign-in page. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-wash px-6 py-8 text-ink sm:px-12">
      <Link href="/" className="flex w-fit items-center gap-2.5 rounded-control text-base font-semibold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
        <span aria-hidden="true" className="inline-grid size-9 place-items-center rounded-control bg-gradient-to-br from-primary to-accent text-white shadow-primary">
          <Activity size={18} strokeWidth={2.25} />
        </span>
        SignalHub
      </Link>
      <div className="m-auto w-full max-w-sm animate-rise py-12">{children}</div>
    </main>
  );
}
