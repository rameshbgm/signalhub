import { notFound } from "next/navigation";
import { PageManagementActions } from "@/components/admin/PageManagementActions";
import { PageManagementShell } from "@/components/admin/PageManagementShell";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { publicPagePath } from "@/lib/public-path";

export default async function ManagedPageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").selectAll().where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null).executeTakeFirst();
  if (!page) notFound();
  const parentHub = page.hubParentId ? await database.selectFrom("pages").select(["id", "name"]).where("id", "=", page.hubParentId).where("orgId", "=", page.orgId).where("isHub", "=", true).where("deletedAt", "is", null).executeTakeFirst() : null;
  const canPublish = page.isHub || Boolean(await database.selectFrom("components").select("id").where("pageId", "=", pageId).where("visible", "=", true).executeTakeFirst());
  const managedPage = { id: pageId, name: page.name, slug: page.slug, isHub: page.isHub, type: page.type, setupCompleted: page.setupCompletedAt !== null, publicVisible: page.publicVisible !== false, publicPath: publicPagePath(page), parentHub: parentHub ? { id: parentHub.id, name: parentHub.name } : null, canPublish };
  return <PageManagementShell page={managedPage} actions={<PageManagementActions page={managedPage} />}>{children}</PageManagementShell>;
}
