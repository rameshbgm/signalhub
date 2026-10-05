import Link from "next/link";
import { BookOpen, ChevronRight, ExternalLink, Search, SearchX } from "lucide-react";
import { HELP_CATEGORIES } from "@/lib/help-content";
import { HELP_CATEGORY_FALLBACK, HELP_CATEGORY_STYLE } from "@/components/admin/help-categories";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

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
    <div className="space-y-8">
      <PageHeader
        title="Help center"
        description="Task-focused guidance for operators, administrators, and developers."
        icon={BookOpen}
        hue="slate"
        actions={
          <a href="/docs/user-manual.html" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary" })}>
            Open the complete HTML user manual
            <ExternalLink aria-hidden size={16} />
          </a>
        }
      />

      <form className="flex max-w-2xl flex-wrap gap-2" action="/organization/help" role="search">
        <div className="min-w-0 flex-1 basis-64">
          <Input
            type="search"
            name="q"
            defaultValue={query}
            aria-label="Search help articles"
            placeholder="Search publishing, incidents, API keys, monitors…"
          />
        </div>
        <Button type="submit" variant="default">
          <Search aria-hidden size={16} />
          Search
        </Button>
        {query && <Link href="/organization/help" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
      </form>

      {categories.map((cat) => {
        const { icon, hue } = HELP_CATEGORY_STYLE[cat.slug] ?? HELP_CATEGORY_FALLBACK;
        return (
          <section key={cat.slug} aria-label={cat.label}>
            <div className="mb-4 flex items-center gap-3">
              <IconTile icon={icon} hue={hue} size="sm" />
              <h2 className="text-lg font-semibold tracking-tight text-ink">{cat.label}</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cat.articles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/organization/help/${cat.slug}/${a.slug}`}
                  className="group flex items-start justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card outline-none transition-[border-color,box-shadow,transform] duration-200 ease-soft hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised focus-visible:ring-4 focus-visible:ring-primary/25"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{a.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-ink-soft">{a.summary}</span>
                  </span>
                  <ChevronRight aria-hidden size={16} className="mt-0.5 shrink-0 text-ink-dim transition-transform duration-200 ease-spring group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {!categories.length && (
        <EmptyState
          icon={SearchX}
          hue="slate"
          title={`No help articles matched “${query}”`}
          description="Try a feature name, workflow, or API term."
          action={<Link href="/organization/help" className={buttonVariants({ variant: "secondary" })}>Clear search</Link>}
        />
      )}
    </div>
  );
}
