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
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-2xl space-y-4">
        <Link href="/organization/pages" className="inline-flex text-sm font-semibold text-[var(--cyan)] hover:underline">← Back to pages</Link>
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-[var(--fg)] sm:text-5xl">New page</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-[var(--fg-soft)]">Start with a name. You can add services, control access, and shape the public experience next.</p>
        </div>
      </header>
      <section className="max-w-3xl rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_1px_3px_rgba(60,64,67,0.12)] sm:p-8">
        <NewPageBasicsForm action={createPage} hubs={hubs} initialHubParentId={validInitialHub} />
      </section>
    </div>
  );
}
