import Link from "next/link";

const STEPS = [
  { key: "components", label: "Add components" },
  { key: "logo", label: "Add your logo" },
  { key: "notifications", label: "Notifications" },
  { key: "team", label: "Invite team" },
  { key: "incidents", label: "Incidents" },
];

export function SetupStepper({ pageId, current }: { pageId: string; current: string }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="border-b border-[var(--line)] pb-5 mb-8 overflow-x-auto">
      <div className="flex items-center justify-center gap-2 min-w-max px-1">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <Link
              href={`/admin/pages/${pageId}/setup/${s.key}`}
              className={`flex items-center gap-2 text-sm font-medium whitespace-nowrap ${
                i === currentIndex ? "text-[var(--cyan)]" : i < currentIndex ? "text-[var(--fg)]" : "text-[var(--fg-dim)]"
              }`}
            >
              <span
                className={`flex h-2.5 w-2.5 rounded-full ${
                  i === currentIndex ? "bg-[var(--cyan)] ring-4 ring-[var(--cyan-soft)]" : i < currentIndex ? "bg-[var(--fg)]" : "bg-[var(--line-bright)]"
                }`}
              />
              {s.label}
            </Link>
            {i < STEPS.length - 1 && <span className="mx-3 h-px w-10 bg-[var(--line)]" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export const SETUP_STEPS = STEPS;
