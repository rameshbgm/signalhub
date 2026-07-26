import Link from "next/link";
import { notFound } from "next/navigation";
import { findHelpArticle, HELP_CATEGORIES } from "@/lib/help-content";

export function generateStaticParams() {
  return HELP_CATEGORIES.flatMap((c) => c.articles.map((a) => ({ category: c.slug, article: a.slug })));
}

export default async function HelpArticlePage({ params }: { params: Promise<{ category: string; article: string }> }) {
  const { category: categorySlug, article: articleSlug } = await params;
  const { category, article } = findHelpArticle(categorySlug, articleSlug);
  if (!category || !article) notFound();

  const siblings = category.articles;
  const currentIndex = siblings.findIndex((a) => a.slug === article.slug);
  const prev = siblings[currentIndex - 1];
  const next = siblings[currentIndex + 1];

  return (
    <div className="max-w-3xl">
      <nav className="mb-4 text-xs text-[var(--fg-dim)]">
        <Link href="/organization/help" className="hover:text-[var(--fg)]">
          Help Center
        </Link>
        <span className="mx-1.5">/</span>
        <span>{category.label}</span>
      </nav>

      <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">{article.title}</h1>
      <p className="mt-2 text-sm text-[var(--fg-soft)]">{article.summary}</p>

      <div className="mt-8 space-y-8">
        {article.body.map((section) => (
          <div key={section.heading}>
            <h2 className="mb-2 font-mono text-base font-semibold text-[var(--fg)]">{section.heading}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="mb-2 text-sm leading-relaxed text-[var(--fg-soft)]">
                {p}
              </p>
            ))}
            {section.list && (
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--fg-soft)]">
                {section.list.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
            {section.code && (
              <pre className="mt-3 overflow-x-auto border border-[var(--line)] bg-[var(--bg)] p-4 text-xs leading-relaxed text-[var(--fg-soft)]">
                <code>{section.code}</code>
              </pre>
            )}
          </div>
        ))}
      </div>

      <div className="mt-12 flex items-center justify-between border-t border-[var(--line)] pt-6 text-sm">
        {prev ? (
          <Link href={`/organization/help/${category.slug}/${prev.slug}`} className="text-[var(--cyan)] hover:underline">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/organization/help/${category.slug}/${next.slug}`} className="text-[var(--cyan)] hover:underline">
            {next.title} →
          </Link>
        ) : (
          <Link href="/organization/help" className="text-[var(--cyan)] hover:underline">
            Back to Help Center
          </Link>
        )}
      </div>
    </div>
  );
}
