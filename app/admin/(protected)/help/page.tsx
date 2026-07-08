import Link from "next/link";
import { HELP_CATEGORIES } from "@/lib/help-content";

export default function HelpCenterPage() {
  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Help Center</h1>
        <p className="text-sm text-gray-500 mt-1.5">Every option in this console, explained — organized the same way the sidebar is.</p>
      </div>

      {HELP_CATEGORIES.map((cat) => (
        <section key={cat.slug}>
          <h2 className="flex items-center gap-2 font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">
            <span aria-hidden>{cat.icon}</span>
            {cat.label}
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {cat.articles.map((a) => (
              <Link
                key={a.slug}
                href={`/admin/help/${cat.slug}/${a.slug}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-500 hover:shadow-sm transition-all"
              >
                <p className="font-medium text-sm">{a.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
