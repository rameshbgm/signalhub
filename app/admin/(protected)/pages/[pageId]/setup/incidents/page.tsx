import Link from "next/link";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { oid } from "@/lib/mongo-utils";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { publicPagePath } from "@/lib/public-path";
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
      <h1 className="font-mono text-2xl font-semibold text-[var(--fg)]">You&apos;re ready to declare incidents</h1>
      <p className="mt-3 text-sm text-[var(--fg-soft)] leading-relaxed max-w-lg">
        When something breaks, open an incident, walk it through its lifecycle, and every subscriber hears it from you — not
        social media.
      </p>

      <div className="mt-8 flex items-center justify-between border border-[var(--line)] bg-[var(--surface)] p-5 overflow-x-auto">
        {LIFECYCLE.map((step, i) => (
          <div key={step} className="flex items-center flex-1 min-w-[5rem]">
            <div className="flex flex-col items-center flex-1">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? "bg-[var(--cyan)] text-[var(--on-cyan)]" : "bg-[var(--surface-raised)] text-[var(--fg-dim)]"}`}>
                {i + 1}
              </span>
              <span className={`mt-2 text-xs font-medium ${i === 0 ? "text-[var(--cyan)]" : "text-[var(--fg-dim)]"}`}>{step}</span>
            </div>
            {i < LIFECYCLE.length - 1 && <span className="h-px flex-1 bg-[var(--line)] -mt-5" />}
          </div>
        ))}
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-sm font-semibold text-[var(--fg)]">Your public status page</p>
          <p className="text-xs text-[var(--fg-dim)] mt-1.5">See it live at:</p>
          <a href={publicPagePath(page)} target="_blank" className="text-sm text-[var(--cyan)] hover:underline break-all">
            {publicPagePath(page)}
          </a>
        </div>
        <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-sm font-semibold text-[var(--fg)]">Declare your first incident</p>
          <p className="text-xs text-[var(--fg-dim)] mt-1.5">Practice the flow — you can delete it after.</p>
          <Link href={`/admin/incidents/new?pageId=${pageId}`} className="text-sm text-[var(--cyan)] hover:underline">
            Declare Incident →
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mt-12 pt-6 border-t border-[var(--line)]">
        <Link href={`/admin/pages/${pageId}/setup/team`} className="text-sm text-[var(--fg-soft)] hover:text-[var(--fg)]">
          ← Back
        </Link>
        <form action={boundComplete}>
          <button className="w-full sm:w-auto bg-[var(--cyan)] text-[var(--on-cyan)] px-6 py-2.5 text-sm font-semibold font-mono">Finish setup</button>
        </form>
      </div>
    </div>
  );
}
