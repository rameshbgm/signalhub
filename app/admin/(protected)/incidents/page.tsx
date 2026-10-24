import { redirect } from "next/navigation";

/** Incidents now live in the Events inbox; old links land on its incidents filter. */
export default async function IncidentsListRedirect({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { pageId } = await searchParams;
  redirect(`/organization/events?show=incidents${pageId ? `&pageId=${encodeURIComponent(pageId)}` : ""}`);
}
