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
      <nav className="text-xs text-gray-400 mb-4">
        <Link href="/admin/help" className="hover:text-gray-700">
          Help Center
        </Link>
        <span className="mx-1.5">/</span>
        <span>{category.label}</span>
      </nav>

      <h1 className="text-2xl font-semibold">{article.title}</h1>
      <p className="mt-2 text-sm text-gray-500">{article.summary}</p>

      <div className="mt-8 space-y-8">
        {article.body.map((section) => (
          <div key={section.heading}>
            <h2 className="font-semibold text-base mb-2">{section.heading}</h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-gray-600 leading-relaxed mb-2">
                {p}
              </p>
            ))}
            {section.list && (
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mt-2">
                {section.list.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-12 pt-6 border-t text-sm">
        {prev ? (
          <Link href={`/admin/help/${category.slug}/${prev.slug}`} className="text-blue-600 hover:underline">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/admin/help/${category.slug}/${next.slug}`} className="text-blue-600 hover:underline">
            {next.title} →
          </Link>
        ) : (
          <Link href="/admin/help" className="text-blue-600 hover:underline">
            Back to Help Center
          </Link>
        )}
      </div>
    </div>
  );
}
