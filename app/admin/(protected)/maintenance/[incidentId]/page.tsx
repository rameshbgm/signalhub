import { redirect } from "next/navigation";

/** Detail screens moved to /organization/events/{id}; old links keep working. */
export default async function LegacyEventDetail({ params }: { params: Promise<{ incidentId: string }> }) {
  redirect(`/organization/events/${encodeURIComponent((await params).incidentId)}`);
}
