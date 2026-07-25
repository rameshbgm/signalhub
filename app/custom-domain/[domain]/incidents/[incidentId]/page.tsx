import { notFound } from "next/navigation";
import { collections } from "@/lib/db";
import IncidentPage from "@/app/(public)/[slug]/incidents/[incidentId]/page";

export default async function CustomDomainIncident({
  params,
}: {
  params: Promise<{ domain: string; incidentId: string }>;
}) {
  const { domain, incidentId } = await params;
  const page = await collections.pages().findOne({
    customDomain: decodeURIComponent(domain).toLowerCase(),
  });
  if (!page) notFound();
  return IncidentPage({
    params: Promise.resolve({ slug: page.slug, incidentId }),
  });
}
