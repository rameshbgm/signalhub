import { redirect } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";

export default async function LegacySetupRedirect({
  params,
}: {
  params: Promise<{ pageId: string; step: string }>;
}) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  redirect(`/organization/pages/${pageId}`);
}
