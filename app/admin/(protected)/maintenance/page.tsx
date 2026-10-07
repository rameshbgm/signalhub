import { redirect } from "next/navigation";

/** Maintenance windows now live in the Events inbox; old links land on its maintenance filter. */
export default async function MaintenanceListRedirect({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { pageId } = await searchParams;
  redirect(`/organization/events?show=maintenance${pageId ? `&pageId=${encodeURIComponent(pageId)}` : ""}`);
}
