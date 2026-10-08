export type PublicPagePathInput = {
  slug: string;
  isHub?: boolean;
};

export function publicPagePath(page: PublicPagePathInput) {
  const slug = encodeURIComponent(page.slug);
  return page.isHub ? `/hub/${slug}` : `/${slug}`;
}

/**
 * Post-login redirect target. Only same-origin paths survive: "//host" and
 * "/\host" are read by browsers as another origin, so they fall back. The check
 * runs on the normalized result too: "/.//host" parses to "//host".
 */
export function safeReturnTo(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || /[\\\x00-\x1f]/.test(value)) return fallback;
  const base = "http://return.invalid";
  try {
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("//") ? fallback : path;
  } catch {
    return fallback;
  }
}
