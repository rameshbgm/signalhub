import { redirect } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";

export default async function SetupTeamPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  redirect(`/organization/pages/${pageId}/setup/incidents`);
}
