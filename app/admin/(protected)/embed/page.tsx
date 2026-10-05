import { requireSession } from "@/lib/require-session";
import { PageSelect } from "@/components/admin/PageSelect";
import { HelpTip } from "@/components/HelpTip";
import { getScopedPages, requireCapability } from "@/lib/admin-guard";
import { publicPagePath } from "@/lib/public-path";
import { Code2, RadioTower } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

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
  const pages = await getScopedPages(session, org.id);
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
    <div className="space-y-8">
      <PageHeader title="SignalHub embed" icon={Code2} hue="teal" description="Add a status banner or badge to your website or app." actions={pages.length > 0 ? <div className="w-full sm:w-56"><PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/embed" selected={pageId} /></div> : undefined} />
      {page ? <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><div className="flex items-center gap-1.5"><CardTitle>Incident banner</CardTitle><HelpTip text="Renders a banner on your site automatically during active incidents or maintenance — no code changes needed after install." /></div><CardDescription>The script stays invisible during normal operation and shows a banner during an active incident or maintenance window.</CardDescription></CardHeader>
          <CardContent className="space-y-3"><pre className="overflow-x-auto rounded-control bg-sunken p-3 font-mono text-xs leading-5 text-ink-soft">{scriptTag}</pre><CopyButton value={scriptTag} label="Copy banner snippet" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Live status badge</CardTitle><CardDescription>Show the current status of this page wherever visitors need it.</CardDescription></CardHeader>
          <CardContent className="space-y-3"><pre className="overflow-x-auto rounded-control bg-sunken p-3 font-mono text-xs leading-5 text-ink-soft">{badgeTag}</pre><CopyButton value={badgeTag} label="Copy badge snippet" />{page.type !== "PUBLIC" && <p className="text-xs text-ink-dim">Replace <code className="font-mono">YOUR_FEED_TOKEN</code> with a signed feed token that has the intended service access.</p>}</CardContent>
        </Card>
      </div> : <EmptyState icon={RadioTower} hue="teal" title="Create a status page first" description="Embeds show the status of a selected page." />}
    </div>
  );
}
