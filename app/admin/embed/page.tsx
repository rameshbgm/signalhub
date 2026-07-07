import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";
import { PageSelect } from "@/components/admin/PageSelect";

export default async function EmbedPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const pages = await prisma.page.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  const page = pages.find((p) => p.id === pageId);

  const scriptTag = page ? `<script async src="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/v1/embed/${page.slug}"></script>` : "";
  const badgeTag = page
    ? `<a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${page.slug}" style="display:inline-flex;align-items:center;gap:6px;font:12px sans-serif;color:#0a9d58;text-decoration:none;">● All Systems Operational</a>`
    : "";

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Status Embed</h1>
      <p className="text-sm text-gray-500">
        Drop this snippet into your website or app. It stays invisible during normal operation and automatically shows a banner
        when there&apos;s an active incident or maintenance window.
      </p>

      <div className="w-56">
        <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/embed" selected={pageId} />
      </div>

      {page && (
        <>
          <div>
            <h2 className="font-semibold text-sm mb-2">Auto-appearing incident banner</h2>
            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-md overflow-x-auto">{scriptTag}</pre>
          </div>
          <div>
            <h2 className="font-semibold text-sm mb-2">Static status badge</h2>
            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-md overflow-x-auto">{badgeTag}</pre>
          </div>
        </>
      )}
    </div>
  );
}
