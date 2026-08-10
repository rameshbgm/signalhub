import type { Metadata } from "next";
import { publicFaviconMetadata } from "@/lib/public-favicon";
import { getPublicPageBySlug } from "@/lib/pages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicPageBySlug(slug, { isHub: false });
  return publicFaviconMetadata(page?.faviconUrl);
}

export default function PublicPageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
