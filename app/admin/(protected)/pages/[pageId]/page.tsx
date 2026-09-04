import Link from "next/link";
import { notFound } from "next/navigation";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";

export default async function PageOverview({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const session = await requireCapability("page.configure", pageId);
  await assertPageInOrg(pageId, session.orgId);
  const page = await database.selectFrom("pages").selectAll().where("id", "=", pageId).where("orgId", "=", session.orgId).where("deletedAt", "is", null).executeTakeFirst();
  if (!page) notFound();
  const componentCount = page.isHub ? 0 : await database.selectFrom("components").select(({ fn }) => fn.countAll<number>().as("count")).where("pageId", "=", pageId).where("visible", "=", true).executeTakeFirstOrThrow().then((row) => Number(row.count));
  const draft = page.setupCompletedAt === null;
  return <div className="space-y-6">
    <section className="border border-[var(--line)] bg-[var(--surface)] p-5"><p className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--cyan)]">{draft ? "Setup" : page.isHub ? "Hub" : "Status page"}</p><h2 className="mt-2 font-mono text-xl font-semibold">{draft ? "Finish your page" : "Page overview"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-dim)]">{page.isHub ? "Group related status pages in this hub." : `${componentCount} visible service${componentCount === 1 ? "" : "s"}.`} {draft ? "Add your services, personalize the page, and publish when you are ready." : page.publicVisible ? "This page is visible to visitors." : "This page is currently hidden from visitors."}</p><div className="mt-5 flex flex-wrap gap-3"><Link href={`/organization/pages/${pageId}/content`} className="border border-[var(--cyan)]/40 px-4 py-2 text-sm font-semibold text-[var(--cyan)]">{page.isHub ? "Manage status pages" : "Manage services"}</Link><Link href={`/organization/pages/${pageId}/appearance`} className="border border-[var(--line)] px-4 py-2 text-sm font-semibold">Customize page</Link></div></section>
    <section className="flex flex-col gap-4 border border-[var(--line)] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-mono font-semibold">Incident readiness</h2><p className="mt-1 text-sm text-[var(--fg-dim)]">Incidents and maintenance remain organization-wide operational workflows.</p></div><div className="flex gap-2"><Link href="/organization/incidents" className="border border-[var(--cyan)]/30 px-3 py-2 text-sm font-semibold text-[var(--cyan)]">Incidents</Link><Link href="/organization/maintenance" className="border border-[var(--cyan)]/30 px-3 py-2 text-sm font-semibold text-[var(--cyan)]">Maintenance</Link></div></section>
  </div>;
}
