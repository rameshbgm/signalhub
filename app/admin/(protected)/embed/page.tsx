import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { toId } from "@/lib/mongo-utils";
import { PageSelect } from "@/components/admin/PageSelect";
import { HelpTip } from "@/components/HelpTip";
import { requireCapability, scopedPageFilter } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";

function escapeHtmlAttribute(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!
  );
}

export default async function EmbedPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("integration.manage");
  const { pageId: pageIdParam } = await searchParams;
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id)).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  const page = pages.find((p) => p.id === pageId);

  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const tokenQuery = page?.type === "PUBLIC" ? "" : "?feed_token=YOUR_FEED_TOKEN";
  const pageUrl = page ? `${appBase}${publicPagePath(page)}` : "";
  const scriptTag = page
    ? `<script async src="${appBase}/api/v1/embed/${encodeURIComponent(page.slug)}${tokenQuery}"></script>`
    : "";
  const badgeTag = page
    ? `<a href="${pageUrl}"><img src="${appBase}/api/v1/badge/${encodeURIComponent(page.slug)}${tokenQuery}" alt="${escapeHtmlAttribute(page.name)} status"></a>`
    : "";

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">SignalHub Embed</h1>
      <p className="text-sm text-[var(--fg-soft)]">
        Drop this snippet into your website or app. It stays invisible during normal operation and automatically shows a banner
        when there&apos;s an active incident or maintenance window.
      </p>

      <div className="w-full sm:w-56">
        <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/embed" selected={pageId} />
      </div>

      {page && (
        <>
          <div>
            <h2 className="mb-2 flex items-center gap-1.5 font-mono text-sm font-semibold text-[var(--fg)]">
              Auto-appearing incident banner
              <HelpTip text="Renders a banner on your site automatically during active incidents or maintenance — no code changes needed after install." />
            </h2>
            <pre className="overflow-x-auto border border-[var(--line)] bg-[var(--bg)] p-3 text-xs text-[var(--fg-soft)]">{scriptTag}</pre>
          </div>
          <div>
            <h2 className="mb-2 font-mono text-sm font-semibold text-[var(--fg)]">Live status badge</h2>
            <pre className="overflow-x-auto border border-[var(--line)] bg-[var(--bg)] p-3 text-xs text-[var(--fg-soft)]">{badgeTag}</pre>
            {page.type !== "PUBLIC" && (
              <p className="mt-2 text-xs text-[var(--fg-dim)]">
                Replace <code>YOUR_FEED_TOKEN</code> with a signed feed token that has the intended component access.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
