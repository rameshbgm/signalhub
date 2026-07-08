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
          <h1 className="text-2xl font-semibold">Add some components</h1>
          <p className="mt-4 text-sm text-gray-600 leading-relaxed">
            Think of Components as the functioning pieces of your application or service that may experience downtime.
          </p>
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            Name them in a way that makes sense to your end users and customers.
          </p>
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">
            Some examples of components include: <strong>API</strong>, <strong>Mobile Application</strong> and{" "}
            <strong>Website</strong>.
          </p>

          <form action={boundCreate} className="mt-8 flex gap-2">
            <input name="name" placeholder="Component name" className="flex-1 border rounded-md px-3 py-2 text-sm" required />
            <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap">
              Add component
            </button>
          </form>
        </div>

        <div>
          <div className="space-y-2">
            {components.map((c) => (
              <div key={c.id} className="flex items-center justify-between border rounded-md px-3 py-2.5 text-sm bg-white">
                <span className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--up)]">
                    <span className="text-white text-[9px]">✓</span>
                  </span>
                  {c.name}
                </span>
                <form action={deleteComponent.bind(null, pageId, c.id)}>
                  <button className="text-xs text-red-500 hover:underline">Remove</button>
                </form>
              </div>
            ))}
            {components.length === 0 && <p className="text-sm text-gray-400">No components yet — add one on the left.</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mt-12 pt-6 border-t">
        <p className="text-xs text-gray-400">Directions: Add at least one component to continue.</p>
        <Link
          href={`/admin/pages/${pageId}/setup/logo`}
          className="bg-blue-600 text-white rounded-md px-5 py-2.5 text-sm font-medium"
        >
          Next: Add your logo →
        </Link>
      </div>
    </div>
  );
}
