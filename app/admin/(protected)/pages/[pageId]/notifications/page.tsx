import { PageNotificationsSection } from "@/components/admin/PageNotificationsSection";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";

export default async function PageNotifications({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  return <PageNotificationsSection pageId={pageId} />;
}
