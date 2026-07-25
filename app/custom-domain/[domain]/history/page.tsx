import { notFound } from "next/navigation";
import { collections } from "@/lib/db";
import HistoryPage from "@/app/(public)/[slug]/history/page";

export default async function CustomDomainHistory({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const page = await collections.pages().findOne({
    customDomain: decodeURIComponent(domain).toLowerCase(),
  });
  if (!page) notFound();
  return HistoryPage({ params: Promise.resolve({ slug: page.slug }) });
}
