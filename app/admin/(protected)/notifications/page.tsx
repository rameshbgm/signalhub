import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { PageSelect } from "@/components/admin/PageSelect";
import { NotificationDestinationManager } from "@/components/admin/NotificationDestinationManager";
import { requireCapability, scopedPageFilter } from "@/lib/admin-guard";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ pageId?: string }>;
}) {
  const { session, org } = await requireSession();
  await requireCapability("integration.manage");
  const requested = (await searchParams).pageId;
  const pages = await collections.pages().find(scopedPageFilter(session, org.id, { isHub: false })).sort({ name: 1 }).toArray();
  const page = pages.find((item) => item._id.toHexString() === requested) ?? pages[0];
  if (!page) return <p className="text-sm text-[var(--fg-dim)]">Create a page first.</p>;
  const destinations = await collections.notificationDestinations().find({ pageId: page._id }).sort({ createdAt: 1 }).toArray();
  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Notification destinations</h1>
          <p className="mt-1 text-sm text-[var(--fg-soft)]">Test and route operational updates to the tools your team already uses.</p>
        </div>
        <div className="w-60"><PageSelect pages={pages.map((item) => ({ id: item._id.toHexString(), name: item.name }))} selected={page._id.toHexString()} basePath="/admin/notifications" /></div>
      </div>
      <NotificationDestinationManager
        pageId={page._id.toHexString()}
        initial={destinations.map((destination) => ({
          id: destination._id.toHexString(),
          name: destination.name,
          channel: destination.channel,
          active: destination.active,
          verifiedAt: destination.verifiedAt?.toISOString() ?? null,
          lastTestOk: destination.lastTestOk,
          lastError: destination.lastError,
        }))}
      />
    </div>
  );
}
