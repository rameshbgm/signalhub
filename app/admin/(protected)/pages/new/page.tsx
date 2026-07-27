import Link from "next/link";
import { NewPageBasicsForm } from "@/components/admin/NewPageBasicsForm";
import { requireCapability } from "@/lib/admin-guard";
import { collections } from "@/lib/db";
import { activePageFilter } from "@/lib/page-lifecycle";
import { oid, toId } from "@/lib/mongo-utils";
import { createPage } from "../actions";

export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<{ hubParentId?: string }>;
}) {
  const session = await requireCapability("page.configure");
  const { hubParentId = "" } = await searchParams;
  const hubs = (await collections.pages().find(activePageFilter({
    orgId: oid(session.orgId),
    isHub: true,
  })).sort({ createdAt: 1 }).toArray()).map(toId);
  const validInitialHub = hubs.some((hub) => hub.id === hubParentId) ? hubParentId : "";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="border-b border-[var(--line)] pb-5">
        <Link href="/organization/pages" className="text-xs font-semibold text-[var(--cyan)] hover:underline">← Back to pages</Link>
        <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--cyan)]">Create page</p>
        <h1 className="mt-2 font-mono text-2xl font-semibold text-[var(--fg)]">Start with the essentials</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--fg-soft)]">
          Choose the public surface and access model. The next screen keeps every remaining setup feature together.
        </p>
      </header>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <NewPageBasicsForm action={createPage} hubs={hubs.map((hub) => ({ id: hub.id, name: hub.name }))} initialHubParentId={validInitialHub} />
      </section>
    </div>
  );
}
