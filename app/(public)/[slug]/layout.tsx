import type { Metadata } from "next";
import { publicFaviconMetadata } from "@/lib/public-favicon";
import { pageDesignFor } from "@/lib/page-design";
import { getPublicPageBySlug } from "@/lib/pages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug, { isHub: false });
  if (!page) return {};
  const indexable = page.type === "PUBLIC" && !page.noindex && !pageDesignFor(page).seo.noIndex;
  return {
    ...publicFaviconMetadata(page.faviconUrl),
    // Applies to history and incident pages as well as the status page.
    robots: indexable ? undefined : { index: false, follow: false },
  };
}

export default function PublicPageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
