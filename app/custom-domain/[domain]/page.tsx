import { notFound } from "next/navigation";
import { collections } from "@/lib/db";
import PublicStatusPage from "@/app/(public)/[slug]/page";

/**
 * Custom-domain resolver. Middleware rewrites the root of any non-app host
 * here; we look up which page claimed that domain and render its status page.
 */
export default async function CustomDomainPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const page = await collections.pages().findOne({ customDomain: decodeURIComponent(domain).toLowerCase() });
  if (!page) notFound();
  return PublicStatusPage({ params: Promise.resolve({ slug: page.slug }) });
}
