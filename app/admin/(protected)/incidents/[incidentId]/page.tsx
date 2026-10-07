import { EventDetail } from "@/components/admin/EventDetail";

export default async function IncidentDetailPage({ params }: { params: Promise<{ incidentId: string }> }) {
  return <EventDetail incidentId={(await params).incidentId} kind="incident" />;
}
