import { notFound } from "next/navigation";
import { collections } from "@/lib/db";
import AccessPage from "@/app/(public)/[slug]/access/page";

export default async function CustomDomainAccess({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const page = await collections.pages().findOne({
    customDomain: decodeURIComponent(domain).toLowerCase(),
  });
  if (!page) notFound();
  return AccessPage({
    params: Promise.resolve({ slug: page.slug }),
    searchParams: Promise.resolve({ returnTo: "/" }),
  });
}
