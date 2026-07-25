import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";

export default async function SetupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);

  return <div className="max-w-3xl mx-auto">{children}</div>;
}
