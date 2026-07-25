import Link from "next/link";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { createComponent, deleteComponent } from "../../components-actions";

export default async function SetupComponentsPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const components = (await collections.components().find({ pageId: oid(pageId) }).sort({ order: 1 }).toArray()).map(toId);
  const boundCreate = createComponent.bind(null, pageId);

  return (
    <div>
      <SetupStepper pageId={pageId} current="components" />
      <div className="grid sm:grid-cols-2 gap-10">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">Add some components</h1>
          <p className="mt-4 text-sm text-[var(--fg-soft)] leading-relaxed">
            Think of Components as the functioning pieces of your application or service that may experience downtime.
          </p>
          <p className="mt-3 text-sm text-[var(--fg-soft)] leading-relaxed">
            Name them in a way that makes sense to your end users and customers.
          </p>
          <p className="mt-3 text-sm text-[var(--fg-soft)] leading-relaxed">
            Some examples of components include: <strong className="text-[var(--fg)]">API</strong>, <strong className="text-[var(--fg)]">Mobile Application</strong> and{" "}
            <strong className="text-[var(--fg)]">Website</strong>.
          </p>

          <form action={boundCreate} className="mt-8 flex flex-col gap-2 sm:flex-row">
            <input name="name" placeholder="Component name" className="flex-1 border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:border-[var(--cyan)] focus:outline-none" required />
            <button className="bg-[var(--cyan)] text-[var(--on-cyan)] px-4 py-2 text-sm font-semibold font-mono whitespace-nowrap">
              Add component
            </button>
          </form>
        </div>

        <div>
          <div className="space-y-2">
            {components.map((c) => (
              <div key={c.id} className="flex items-center justify-between border border-[var(--line)] px-3 py-2.5 text-sm bg-[var(--surface)]">
                <span className="flex items-center gap-2 text-[var(--fg)]">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--cyan)]">
                    <span className="text-[var(--bg)] text-[9px]">✓</span>
                  </span>
                  {c.name}
                </span>
                <form action={deleteComponent.bind(null, pageId, c.id)}>
                  <button className="border border-[var(--red)]/30 px-2.5 py-1 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-soft)]">Remove</button>
                </form>
              </div>
            ))}
            {components.length === 0 && <p className="text-sm text-[var(--fg-dim)]">No components yet — add one on the left.</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mt-12 pt-6 border-t border-[var(--line)]">
        <p className="text-xs text-[var(--fg-dim)]">Directions: Add at least one component to continue.</p>
        <Link
          href={`/admin/pages/${pageId}/setup/logo`}
          className="bg-[var(--cyan)] text-[var(--on-cyan)] px-5 py-2.5 text-sm font-semibold font-mono text-center"
        >
          Next: Add your logo →
        </Link>
      </div>
    </div>
  );
}
