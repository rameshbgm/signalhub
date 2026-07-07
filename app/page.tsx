import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function Home() {
  const pages = await prisma.page.findMany({ where: { type: "PUBLIC" }, orderBy: { createdAt: "asc" } });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Statuspage Platform</h1>
        <p className="text-gray-500 max-w-md">A status page & incident communication platform. Build a branded status page, run incidents, and keep customers informed.</p>
      </div>
      <div className="flex gap-3">
        <Link href="/admin" className="bg-blue-600 text-white rounded-md px-5 py-2.5 text-sm font-medium">
          Go to Admin Console
        </Link>
        <Link href="/acme" className="border rounded-md px-5 py-2.5 text-sm font-medium">
          View Demo Status Page
        </Link>
      </div>
      {pages.length > 0 && (
        <div className="text-sm text-gray-400">
          Demo pages:{" "}
          {pages.map((p, i) => (
            <span key={p.id}>
              <Link href={`/${p.slug}`} className="text-blue-600 hover:underline">
                {p.name}
              </Link>
              {i < pages.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
