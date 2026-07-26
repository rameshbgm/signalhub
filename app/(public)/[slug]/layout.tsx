import type { Metadata } from "next";
import { collections } from "@/lib/db";
import { publicFaviconMetadata } from "@/lib/public-favicon";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await collections.pages().findOne(
    { slug, isHub: false },
    { projection: { faviconUrl: 1 } }
  );
  return publicFaviconMetadata(page?.faviconUrl);
}

export default function PublicPageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
