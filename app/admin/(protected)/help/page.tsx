import Link from "next/link";
import { HELP_CATEGORIES } from "@/lib/help-content";

export default async function HelpCenterPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = ((await searchParams).q ?? "").trim();
  const normalizedQuery = query.toLowerCase();
  const categories = HELP_CATEGORIES.map((category) => ({
    ...category,
    articles: normalizedQuery
      ? category.articles.filter((article) => [
          article.title,
          article.summary,
          ...article.body.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.list ?? []), section.code ?? ""]),
        ].join(" ").toLowerCase().includes(normalizedQuery))
      : category.articles,
  })).filter((category) => category.articles.length > 0);

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Help Center</h1>
        <p className="mt-1.5 text-sm text-[var(--fg-soft)]">Task-focused guidance for operators, administrators, and developers.</p>
        <form className="mt-5 flex gap-2" action="/organization/help">
          <input
            type="search"
            name="q"
            defaultValue={query}
            aria-label="Search help articles"
            placeholder="Search publishing, incidents, API keys, monitors…"
            className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]"
          />
          <button className="border border-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--cyan)]">Search</button>
          {query && <Link href="/organization/help" className="inline-flex items-center px-2 text-sm text-[var(--fg-dim)] hover:text-[var(--fg)]">Clear</Link>}
        </form>
      </div>

      {categories.map((cat) => (
        <section key={cat.slug}>
          <h2 className="mb-3 flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
            <span aria-hidden>{cat.icon}</span>
            {cat.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {cat.articles.map((a) => (
              <Link
                key={a.slug}
                href={`/organization/help/${cat.slug}/${a.slug}`}
                className="block border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--cyan)]"
              >
                <p className="text-sm font-medium text-[var(--fg)]">{a.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--fg-soft)]">{a.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {!categories.length && (
        <div className="border border-[var(--line)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-soft)]">
          No help articles matched “{query}”. Try a feature name, workflow, or API term.
        </div>
      )}
    </div>
  );
}
