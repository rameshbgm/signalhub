import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { HelpTip } from "@/components/HelpTip";
import { requireCapability } from "@/lib/admin-guard";

export default async function ThirdPartyCatalogPage() {
  await requireSession();
  await requireCapability("integration.manage");
  const providers = (
    await collections.monitorTemplates().find({ enabled: true }).sort({ category: 1, name: 1 }).toArray()
  ).map(toId);
  const byCategory = new Map<string, typeof providers>();
  for (const p of providers) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="flex items-center gap-1.5 font-mono text-xl font-semibold text-[var(--fg)]">
        Monitor Templates
        <HelpTip text="Templates create real worker-backed monitors. You can change every target, interval, assertion, and action after creating one." />
      </h1>
      <p className="text-sm text-[var(--fg-soft)]">
        {providers.length} curated checks with stable public endpoints. Select one while adding a component to create an enabled
        monitor with editable configuration. Templates are starting points; the worker always evaluates the stored monitor
        configuration.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {[...byCategory.entries()].map(([category, items]) => (
          <div key={category} className="border border-[var(--line)] bg-[var(--surface)] p-4">
            <h2 className="mb-2 font-mono text-sm font-semibold text-[var(--fg)]">{category}</h2>
            <ul className="space-y-1 text-sm text-[var(--fg-soft)]">
              {items.map((p) => (
                <li key={p.id}>
                  <span className="text-[var(--fg)]">{p.name}</span>
                  <span className="ml-2 font-mono text-xs text-[var(--fg-dim)]">{p.type}</span>
                  <p className="text-xs text-[var(--fg-dim)]">{p.description}</p>
                  <p className="truncate font-mono text-[11px] text-[var(--cyan)]">{p.target}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
