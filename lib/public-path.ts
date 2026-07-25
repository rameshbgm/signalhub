import { headers } from "next/headers";

export type PublicPagePathInput = {
  slug: string;
  isHub?: boolean;
};

export function publicPagePath(page: PublicPagePathInput) {
  const slug = encodeURIComponent(page.slug);
  return page.isHub ? `/hub/${slug}` : `/${slug}`;
}

export async function publicBasePath(
  page: PublicPagePathInput & { customDomain?: string | null }
) {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();
  return page.customDomain && host === page.customDomain.toLowerCase()
    ? ""
    : publicPagePath(page);
}
