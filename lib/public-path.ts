export type PublicPagePathInput = {
  slug: string;
  isHub?: boolean;
};

export function publicPagePath(page: PublicPagePathInput) {
  const slug = encodeURIComponent(page.slug);
  return page.isHub ? `/hub/${slug}` : `/${slug}`;
}
