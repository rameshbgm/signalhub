import { EventDetail } from "@/components/admin/EventDetail";

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  return <EventDetail incidentId={(await params).eventId} />;
}
