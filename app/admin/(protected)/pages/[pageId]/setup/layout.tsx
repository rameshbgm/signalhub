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

  return <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 sm:px-6 sm:pt-8">{children}</div>;
}
