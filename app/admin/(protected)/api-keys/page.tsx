import { requireSession } from "@/lib/require-session";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { database } from "@/lib/postgres/client";
import { PageSelect } from "@/components/admin/PageSelect";
import { ApiKeyActions, ApiKeyCreator } from "@/components/admin/ApiKeyManager";
import { secretLabel } from "@/lib/secrets";
import { WebhookEndpointManager } from "@/components/admin/WebhookEndpointManager";
import { FeedTokenManager } from "@/components/admin/FeedTokenManager";
import { getScopedPages, requireCapability } from "@/lib/admin-guard";
import { KeyRound, RadioTower, Rss } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function ApiKeysPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("integration.manage");
  const { pageId: pageIdParam } = await searchParams;
  const keys = await database.selectFrom("apiKeys").selectAll().where("orgId", "=", org.id)
    .where("revokedAt", "is", null).orderBy("createdAt", "asc").execute();
  const pages = await getScopedPages(session, org.id);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  const webhookEndpoints = pageId
    ? await database.selectFrom("webhookEndpoints").selectAll().where("pageId", "=", pageId).execute()
    : [];
  const selectedPage = pages.find((page) => page.id === pageId);
  const feedTokens = pageId
    ? await database.selectFrom("feedTokens").selectAll().where("pageId", "=", pageId)
      .where("revokedAt", "is", null).orderBy("createdAt", "desc").execute()
    : [];
  const pageComponents = pageId
    ? await database.selectFrom("components").selectAll().where("pageId", "=", pageId)
      .where("visible", "=", true).orderBy("order", "asc").execute()
    : [];

  return (
    <div className="space-y-8">
      {session.role === "ADMIN" && <PlatformNav />}
      <PageHeader title="API keys and webhooks" icon={KeyRound} hue="teal" description="Manage programmatic access, signed webhooks, and protected feeds." />
      <Card>
        <CardHeader>
          <CardTitle>Management API keys</CardTitle>
          <CardDescription>Use a key to authenticate Management API requests. Send it as <code className="rounded-chip bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">Authorization: Bearer &lt;key&gt;</code> to <code className="font-mono text-xs text-ink">/api/v1/manage/*</code>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ApiKeyCreator pages={pages.map((page) => ({ id: page.id, name: page.name }))} />
          {keys.length > 0 ? <ul className="space-y-2">
            {keys.map((k) => <li key={k.id} className="flex flex-col gap-3 rounded-control border border-line px-3.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{k.name}</span><code className="rounded-chip bg-sunken px-1.5 py-0.5 text-xs text-ink-soft">{secretLabel(k.prefix, k.lastFour)}</code>{k.legacyFullAccess && <StatusBadge tone="warn">Legacy full access — rotate</StatusBadge>}</div>
                <p className="break-words text-xs text-ink-dim">{(k.scopes ?? []).join(", ") || "No scopes"}{k.expiresAt ? ` · expires ${k.expiresAt.toLocaleString()}` : " · no expiry"}</p>
              </div>
              <ApiKeyActions id={k.id} />
            </li>)}
          </ul> : <EmptyState icon={KeyRound} hue="teal" title="No API keys yet" description="Create a key above to give an integration access to the Management API." />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><CardTitle>Outbound webhooks</CardTitle><CardDescription className="mt-1">Incident, maintenance, and postmortem events for the selected page are sent as JSON to active endpoints.</CardDescription></div>
          {pages.length > 0 && <div className="w-full sm:w-56"><PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/organization/api-keys" selected={pageId} /></div>}
        </CardHeader>
        <CardContent>{pageId ? <WebhookEndpointManager pageId={pageId} endpoints={webhookEndpoints.map((endpoint) => ({ id: endpoint.id, url: endpoint.url, secretLabel: secretLabel(endpoint.secretPrefix, endpoint.secretLastFour), verifiedAt: endpoint.verifiedAt?.toISOString() ?? null }))} /> : <EmptyState icon={RadioTower} hue="teal" title="Create a status page first" description="Webhooks are connected to a status page." />}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Protected feed tokens</CardTitle><CardDescription>Private and audience pages use revocable, optionally service-scoped tokens for RSS, Atom, embeds, and public API reads.</CardDescription></CardHeader>
        <CardContent>
          {selectedPage?.type === "PUBLIC" ? <Alert tone="info">This page is public and its RSS and Atom feeds do not require a token.</Alert> : selectedPage ? (
            <FeedTokenManager pageId={selectedPage.id} pageSlug={selectedPage.slug} components={pageComponents.map((component) => ({ id: component.id, name: component.name }))} tokens={feedTokens.map((token) => ({ id: token.id, name: token.name, label: secretLabel(token.prefix, token.lastFour), expiresAt: token.expiresAt?.toISOString() ?? null, lastUsedAt: token.lastUsedAt?.toISOString() ?? null }))} />
          ) : <EmptyState icon={Rss} hue="teal" title="Create a status page first" description="Feed tokens are connected to a status page." />}
        </CardContent>
      </Card>
    </div>
  );
}
