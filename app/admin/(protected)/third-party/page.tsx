import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { HelpTip } from "@/components/HelpTip";
import { requireCapability } from "@/lib/admin-guard";
import Link from "next/link";

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
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">
          Monitor Templates
        </h1>
        <HelpTip text="This is the read-only global master catalog. Pages can add or remove templates, but cannot edit them." />
      </div>
      <p className="text-sm text-[var(--fg-soft)]">
        {providers.length} master checks maintained globally. Status pages can show or remove these monitors without changing their definitions.
      </p>
      <Link href="/organization/monitors" className="inline-block bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)]">Add or remove monitors on a page</Link>
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
