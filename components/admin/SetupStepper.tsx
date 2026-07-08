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
    <div className="border-b border-gray-200 pb-5 mb-8">
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <Link
              href={`/admin/pages/${pageId}/setup/${s.key}`}
              className={`flex items-center gap-2 text-sm font-medium ${
                i === currentIndex ? "text-blue-600" : i < currentIndex ? "text-gray-700" : "text-gray-400"
              }`}
            >
              <span
                className={`flex h-2.5 w-2.5 rounded-full ${
                  i === currentIndex ? "bg-blue-600 ring-4 ring-blue-100" : i < currentIndex ? "bg-gray-700" : "bg-gray-300"
                }`}
              />
              {s.label}
            </Link>
            {i < STEPS.length - 1 && <span className="mx-3 h-px w-10 bg-gray-200" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export const SETUP_STEPS = STEPS;
