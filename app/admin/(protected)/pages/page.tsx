import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections, type PageDoc } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { scopedPageFilter, sessionHasCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";

export default async function PagesListPage() {
  const { session, org } = await requireSession();
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id)).sort({ createdAt: 1 }).toArray()).map(toId);
  const canConfigure = sessionHasCapability(session, "page.configure");
  const hubs = pages.filter((page) => page.isHub);
  const activeHubIds = new Set(hubs.map((hub) => hub.id));
  const membersByHub = new Map(hubs.map((hub) => [hub.id, pages.filter((page) => !page.isHub && page.hubParentId?.toString() === hub.id)]));
  const standalone = pages.filter((page) => !page.isHub && (!page.hubParentId || !activeHubIds.has(page.hubParentId.toString())));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--cyan)]">Organization console</p><h1 className="mt-2 font-mono text-2xl font-semibold">Pages</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-soft)]">Hubs collect related status pages. Standalone status pages can be added to a hub at any time.</p></div>
        {canConfigure && <Link href="/organization/pages/new" className="shrink-0 bg-[var(--cyan)] px-5 py-2.5 text-center font-mono text-sm font-semibold text-[var(--on-cyan)]">Create page</Link>}
      </header>

      {!canConfigure && <aside className="border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--fg-soft)]">Your role can view assigned pages. Page creation and branding require an administrator.</aside>}

      {hubs.length > 0 && (
        <section className="space-y-3" aria-labelledby="hubs-title">
          <div className="flex items-end justify-between"><div><h2 id="hubs-title" className="font-mono text-base font-semibold">Hubs and their status pages</h2><p className="mt-1 text-sm text-[var(--fg-dim)]">Each indented page is a normal status page assigned to that hub.</p></div><span className="font-mono text-xs text-[var(--fg-dim)]">{hubs.length} hub{hubs.length === 1 ? "" : "s"}</span></div>
          {hubs.map((hub) => {
            const members = membersByHub.get(hub.id) ?? [];
            return <article key={hub.id} className="overflow-hidden border border-[var(--line)] bg-[var(--surface)]"><PageRow page={hub} canConfigure={canConfigure} relation={`${members.length} status page${members.length === 1 ? "" : "s"}`} /><div className="border-t border-[var(--line)] bg-[var(--bg)] px-3 py-3 sm:px-5"><div className="space-y-2 border-l-2 border-[var(--cyan)]/30 pl-3 sm:pl-5">{members.map((member) => <PageRow key={member.id} page={member} canConfigure={canConfigure} nested />)}{members.length === 0 && <div className="flex flex-col gap-2 py-2 text-sm text-[var(--fg-dim)] sm:flex-row sm:items-center sm:justify-between"><span>No status pages assigned yet.</span>{canConfigure && <Link href={`/organization/pages/new?hubParentId=${hub.id}`} className="font-semibold text-[var(--cyan)]">Create status page in this hub →</Link>}</div>}</div></div></article>;
          })}
        </section>
      )}

      <section className="space-y-3" aria-labelledby="standalone-title">
        <div className="flex items-end justify-between"><div><h2 id="standalone-title" className="font-mono text-base font-semibold">Standalone status pages</h2><p className="mt-1 text-sm text-[var(--fg-dim)]">These pages are not currently assigned to a hub.</p></div>{standalone.length > 0 && <span className="font-mono text-xs text-[var(--fg-dim)]">{standalone.length} total</span>}</div>
        <div className="space-y-2">{standalone.map((page) => <article key={page.id} className="border border-[var(--line)] bg-[var(--surface)]"><PageRow page={page} canConfigure={canConfigure} relation={page.hubParentId ? "Previous hub unavailable" : undefined} /></article>)}{standalone.length === 0 && <div className="border border-dashed border-[var(--line-bright)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--fg-dim)]">No standalone status pages.</div>}</div>
      </section>

      {pages.length === 0 && <div className="border border-dashed border-[var(--line-bright)] bg-[var(--surface)] px-5 py-8 text-center"><p className="font-mono text-sm font-semibold">No pages yet</p><p className="mt-1 text-sm text-[var(--fg-dim)]">Create a status page or a hub to get started.</p>{canConfigure && <Link href="/organization/pages/new" className="mt-4 inline-flex text-sm font-semibold text-[var(--cyan)]">Create your first page →</Link>}</div>}
    </div>
  );
}

type PageRowData = ReturnType<typeof toId<PageDoc>>;

function PageRow({ page, canConfigure, nested = false, relation }: { page: PageRowData; canConfigure: boolean; nested?: boolean; relation?: string }) {
  const state = page.setupCompletedAt === null ? "Draft" : page.publicVisible === false ? "Hidden" : "Published";
  return (
    <div className={`flex min-w-0 flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${nested ? "bg-[var(--surface)]" : ""}`}>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[var(--fg)]">{page.name}</span><span className="bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-soft)]">{page.isHub ? "Hub" : "Status page"}</span><span className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${state === "Published" ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--amber-soft)] text-[var(--amber)]"}`}>{state}</span></div><p className="mt-1 text-xs text-[var(--fg-dim)]">/{page.slug}{relation ? ` · ${relation}` : ""}</p></div>
      <div className="flex shrink-0 gap-2">{page.setupCompletedAt !== null && page.publicVisible !== false && <a href={publicPagePath(page)} target="_blank" rel="noreferrer" className="border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-soft)]">View</a>}{canConfigure && <Link href={`/organization/pages/${page.id}`} className="border border-[var(--cyan)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--cyan)]">{page.setupCompletedAt === null ? "Continue setup" : "Manage"}</Link>}</div>
    </div>
  );
}
