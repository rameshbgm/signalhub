import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";

export default async function ThirdPartyCatalogPage() {
  await requireSession();
  const providers = await prisma.thirdPartyProvider.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  const byCategory = new Map<string, typeof providers>();
  for (const p of providers) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Third-Party Provider Catalog</h1>
      <p className="text-sm text-gray-500">
        {providers.length} providers available to mirror as read-only components. Add one from a page&apos;s Components section by
        checking &quot;Mirror a third-party provider&quot;. When a mirrored provider degrades, update its status the same way you
        would any component (manually here, or via its automation webhook) — this build ships a static catalog rather than live
        feeds from each vendor.
      </p>
      <div className="grid sm:grid-cols-2 gap-6">
        {[...byCategory.entries()].map(([category, items]) => (
          <div key={category} className="bg-white border rounded-lg p-4">
            <h2 className="font-semibold text-sm mb-2">{category}</h2>
            <ul className="text-sm text-gray-600 space-y-1">
              {items.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
