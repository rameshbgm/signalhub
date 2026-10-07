import { redirect } from "next/navigation";

/** A page's events live in the Events inbox, filtered to that page. */
export default async function PageEventsRedirect({ params }: { params: Promise<{ pageId: string }> }) {
  redirect(`/organization/events?pageId=${encodeURIComponent((await params).pageId)}`);
}
