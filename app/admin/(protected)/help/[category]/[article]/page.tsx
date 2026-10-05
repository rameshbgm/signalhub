import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { findHelpArticle, HELP_CATEGORIES } from "@/lib/help-content";
import { HELP_CATEGORY_FALLBACK, HELP_CATEGORY_STYLE } from "@/components/admin/help-categories";
import { CopyButton } from "@/components/CopyButton";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function generateStaticParams() {
  return HELP_CATEGORIES.flatMap((c) => c.articles.map((a) => ({ category: c.slug, article: a.slug })));
}

const navLink =
  "group flex items-center gap-3 rounded-card bg-surface shadow-card ring-1 ring-line/80 p-4 outline-none transition-[border-color,box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised focus-visible:ring-4 focus-visible:ring-primary/25";

export default async function HelpArticlePage({ params }: { params: Promise<{ category: string; article: string }> }) {
  const { category: categorySlug, article: articleSlug } = await params;
  const { category, article } = findHelpArticle(categorySlug, articleSlug);
  if (!category || !article) notFound();

  const siblings = category.articles;
  const currentIndex = siblings.findIndex((a) => a.slug === article.slug);
  const prev = siblings[currentIndex - 1];
  const next = siblings[currentIndex + 1];
  const { icon, hue } = HELP_CATEGORY_STYLE[category.slug] ?? HELP_CATEGORY_FALLBACK;

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-dim">
          <Link href="/organization/help" className="rounded-chip font-medium text-ink-soft outline-none hover:text-primary-ink focus-visible:ring-4 focus-visible:ring-primary/25">
            Help center
          </Link>
          <ChevronRight aria-hidden size={14} />
          <span>{category.label}</span>
        </nav>
        <PageHeader title={article.title} description={article.summary} icon={icon} hue={hue} />
      </div>

      <div className="max-w-3xl space-y-8">
        <Card>
          <CardContent className="space-y-8 p-6 sm:p-8">
            {article.body.map((section) => (
              <section key={section.heading}>
                <h2 className="text-lg font-bold tracking-tight text-ink">{section.heading}</h2>
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="mt-2 text-sm leading-7 text-ink-soft">
                    {p}
                  </p>
                ))}
                {section.list && (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-soft marker:text-ink-dim">
                    {section.list.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
                {section.code && (
                  <div className="mt-4 overflow-hidden rounded-control border border-line">
                    <div className="flex items-center justify-between gap-2 border-b border-line bg-sunken px-3 py-1.5">
                      <span className="text-xs font-medium text-ink-dim">Example</span>
                      <CopyButton value={section.code} />
                    </div>
                    <pre className="overflow-x-auto bg-surface p-4 font-mono text-xs leading-6 text-ink">
                      <code>{section.code}</code>
                    </pre>
                  </div>
                )}
              </section>
            ))}
          </CardContent>
        </Card>

        <nav aria-label="Article navigation" className="grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link href={`/organization/help/${category.slug}/${prev.slug}`} className={navLink}>
              <ChevronLeft aria-hidden size={16} className="shrink-0 text-ink-dim transition-transform duration-200 ease-spring group-hover:-translate-x-0.5 group-hover:text-primary" />
              <span className="min-w-0">
                <span className="block text-xs text-ink-dim">Previous</span>
                <span className="block truncate text-sm font-semibold text-ink">{prev.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/organization/help/${category.slug}/${next.slug}`} className={`${navLink} justify-end text-right sm:col-start-2`}>
              <span className="min-w-0">
                <span className="block text-xs text-ink-dim">Next</span>
                <span className="block truncate text-sm font-semibold text-ink">{next.title}</span>
              </span>
              <ChevronRight aria-hidden size={16} className="shrink-0 text-ink-dim transition-transform duration-200 ease-spring group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ) : (
            <Link href="/organization/help" className={buttonVariants({ variant: "secondary", className: "sm:col-start-2 sm:justify-self-end" })}>
              <ArrowLeft aria-hidden size={16} />
              Back to Help Center
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
