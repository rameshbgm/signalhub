import { notFound } from "next/navigation";
import { PageManagementShell } from "@/components/admin/PageManagementShell";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";
import { activePageFilter } from "@/lib/page-lifecycle";
import { publicPagePath } from "@/lib/public-path";

export default async function ManagedPageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await collections.pages().findOne(activePageFilter({ _id: oid(pageId), orgId: oid(session.orgId) }));
  if (!page) notFound();
  const parentHub = page.hubParentId
    ? await collections.pages().findOne(activePageFilter({ _id: page.hubParentId, orgId: page.orgId, isHub: true }))
    : null;

  return (
    <PageManagementShell page={{
      id: pageId,
      name: page.name,
      slug: page.slug,
      isHub: page.isHub,
      type: page.type,
      setupCompleted: page.setupCompletedAt !== null,
      publicVisible: page.publicVisible !== false,
      publicPath: publicPagePath(page),
      parentHub: parentHub ? { id: parentHub._id.toHexString(), name: parentHub.name } : null,
    }}>
      {children}
    </PageManagementShell>
  );
}
