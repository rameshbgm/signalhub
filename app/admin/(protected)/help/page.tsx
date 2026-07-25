import Link from "next/link";
import { HELP_CATEGORIES } from "@/lib/help-content";

export default function HelpCenterPage() {
  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Help Center</h1>
        <p className="mt-1.5 text-sm text-[var(--fg-soft)]">Every option in this console, explained — organized the same way the sidebar is.</p>
      </div>

      {HELP_CATEGORIES.map((cat) => (
        <section key={cat.slug}>
          <h2 className="mb-3 flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
            <span aria-hidden>{cat.icon}</span>
            {cat.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {cat.articles.map((a) => (
              <Link
                key={a.slug}
                href={`/admin/help/${cat.slug}/${a.slug}`}
                className="block border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--cyan)]"
              >
                <p className="text-sm font-medium text-[var(--fg)]">{a.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--fg-soft)]">{a.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
