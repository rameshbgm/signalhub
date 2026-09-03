import Link from "next/link";
import { NewPageBasicsForm } from "@/components/admin/NewPageBasicsForm";
import { requireCapability } from "@/lib/admin-guard";
import { database } from "@/lib/postgres/client";
import { createPage } from "../actions";

export default async function NewPage({ searchParams }: { searchParams: Promise<{ hubParentId?: string }> }) {
  const session = await requireCapability("page.configure");
  const { hubParentId = "" } = await searchParams;
  const hubs = await database.selectFrom("pages").select(["id", "name"])
    .where("orgId", "=", session.orgId).where("isHub", "=", true).where("deletedAt", "is", null)
    .orderBy("createdAt", "asc").execute();
  const validInitialHub = hubs.some((hub) => hub.id === hubParentId) ? hubParentId : "";
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <header className="space-y-4">
        <Link href="/organization/pages" className="inline-flex text-xs font-semibold text-[var(--cyan)] hover:underline">← Back to pages</Link>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--cyan)]">Pages</p>
          <h1 className="mt-2 font-mono text-3xl font-semibold text-[var(--fg)]">New page</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--fg-soft)]">Name it now. Configure services, access, and appearance after it is created.</p>
        </div>
      </header>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <NewPageBasicsForm action={createPage} hubs={hubs} initialHubParentId={validInitialHub} />
      </section>
    </div>
  );
}
