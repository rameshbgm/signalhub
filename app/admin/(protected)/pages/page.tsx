import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { createPage } from "./actions";

export default async function PagesListPage() {
  const { org } = await requireSession();
  const pages = (await collections.pages().find({ orgId: oid(org.id) }).sort({ createdAt: 1 }).toArray()).map(toId);
  const hubs = pages.filter((p) => p.isHub);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Pages</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-2">
          {pages.map((p) => (
            <div key={p.id} className="flex items-center justify-between border rounded-lg p-3 bg-white text-sm">
              <div>
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-gray-400 ml-2">/{p.slug}</span>
                <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5 ml-2">{p.type}</span>
                {p.isHub && <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 ml-2">hub</span>}
              </div>
              <div className="flex gap-3">
                <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  View
                </a>
                <Link href={`/admin/pages/${p.id}/setup/components`} className="text-blue-600 hover:underline">
                  Build my page
                </Link>
                <Link href={`/admin/pages/${p.id}`} className="text-blue-600 hover:underline">
                  Manage
                </Link>
              </div>
            </div>
          ))}
          {pages.length === 0 && <p className="text-sm text-gray-400">No pages yet. Create your first one.</p>}
        </div>

        <form action={createPage} className="border rounded-lg p-4 bg-white space-y-3 h-fit">
          <h2 className="font-semibold text-sm">New Page</h2>
          <input name="name" placeholder="Page name" className="w-full border rounded-md px-3 py-2 text-sm" required />
          <input name="slug" placeholder="URL slug (optional)" className="w-full border rounded-md px-3 py-2 text-sm" />
          <select name="type" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private (password protected)</option>
            <option value="AUDIENCE">Audience-specific (per-user login)</option>
          </select>
          <input name="password" type="password" placeholder="Password (if private)" className="w-full border rounded-md px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isHub" /> This is a hub page
          </label>
          {hubs.length > 0 && (
            <select name="hubParentId" className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">No hub parent</option>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  Child of {h.name}
                </option>
              ))}
            </select>
          )}
          <button className="w-full bg-blue-600 text-white rounded-md py-2 text-sm font-medium">Create Page</button>
        </form>
      </div>
    </div>
  );
}
