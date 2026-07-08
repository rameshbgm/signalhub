import Link from "next/link";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { oid } from "@/lib/mongo-utils";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { completeSetup } from "../actions";

const LIFECYCLE = ["Investigating", "Identified", "Monitoring", "Resolved"];

export default async function SetupIncidentsPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const pageDoc = await collections.pages().findOne({ _id: oid(pageId) });
  const page = toId(pageDoc!);
  const boundComplete = completeSetup.bind(null, pageId);

  return (
    <div>
      <SetupStepper pageId={pageId} current="incidents" />
      <h1 className="text-2xl font-semibold">You're ready to declare incidents</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed max-w-lg">
        When something breaks, open an incident, walk it through its lifecycle, and every subscriber hears it from you — not
        social media.
      </p>

      <div className="mt-8 flex items-center justify-between rounded-lg border border-gray-200 bg-white p-5">
        {LIFECYCLE.map((step, i) => (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                {i + 1}
              </span>
              <span className={`mt-2 text-xs font-medium ${i === 0 ? "text-blue-600" : "text-gray-400"}`}>{step}</span>
            </div>
            {i < LIFECYCLE.length - 1 && <span className="h-px flex-1 bg-gray-200 -mt-5" />}
          </div>
        ))}
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-semibold">Your public status page</p>
          <p className="text-xs text-gray-500 mt-1.5">See it live at:</p>
          <a href={`/${page.slug}`} target="_blank" className="text-sm text-blue-600 hover:underline break-all">
            /{page.slug}
          </a>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-semibold">Declare your first incident</p>
          <p className="text-xs text-gray-500 mt-1.5">Practice the flow — you can delete it after.</p>
          <Link href={`/admin/incidents/new?pageId=${pageId}`} className="text-sm text-blue-600 hover:underline">
            Declare Incident →
          </Link>
        </div>
      </div>

      <div className="flex justify-between items-center mt-12 pt-6 border-t">
        <Link href={`/admin/pages/${pageId}/setup/team`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back
        </Link>
        <form action={boundComplete}>
          <button className="bg-blue-600 text-white rounded-md px-6 py-2.5 text-sm font-medium">Finish setup</button>
        </form>
      </div>
    </div>
  );
}
