import { requireSession } from "@/lib/require-session";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { PageSelect } from "@/components/admin/PageSelect";
import { ApiKeyActions, ApiKeyCreator } from "@/components/admin/ApiKeyManager";
import { secretLabel } from "@/lib/secrets";
import { WebhookEndpointManager } from "@/components/admin/WebhookEndpointManager";
import { FeedTokenManager } from "@/components/admin/FeedTokenManager";
import { requireCapability, scopedPageFilter } from "@/lib/admin-guard";

export default async function ApiKeysPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { session, org } = await requireSession();
  await requireCapability("integration.manage");
  const { pageId: pageIdParam } = await searchParams;
  const keys = (await collections.apiKeys().find({ orgId: oid(org.id) }).sort({ createdAt: 1 }).toArray()).map(toId);
  const pages = (await collections.pages().find(scopedPageFilter(session, org.id)).sort({ createdAt: 1 }).toArray()).map(toId);
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  const webhookEndpoints = pageId
    ? (await collections.webhookEndpoints().find({ pageId: oid(pageId) }).toArray()).map(toId)
    : [];
  const selectedPage = pages.find((page) => page.id === pageId);
  const feedTokens = pageId
    ? (
        await collections
          .feedTokens()
          .find({ pageId: oid(pageId), revokedAt: null })
          .sort({ createdAt: -1 })
          .toArray()
      ).map(toId)
    : [];
  const pageComponents = pageId
    ? (await collections.components().find({ pageId: oid(pageId), visible: true }).sort({ order: 1 }).toArray()).map(toId)
    : [];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-mono text-xl font-semibold text-[var(--fg)]">API Keys &amp; Webhooks</h1>
      <p className="text-sm text-[var(--fg-soft)]">
        Use these keys to authenticate programmatic access to the Management API. Pass as{" "}
        <code className="bg-[var(--surface)] px-1 text-[var(--fg)]">Authorization: Bearer &lt;key&gt;</code>. See{" "}
        <code className="bg-[var(--surface)] px-1 text-[var(--fg)]">/api/v1/manage/*</code> endpoints.
      </p>

      <ApiKeyCreator pages={pages.map((page) => ({ id: page.id, name: page.name }))} />

      <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--surface)]">
        {keys.map((k) => (
          <div key={k.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-medium text-[var(--fg)]">{k.name}</span>
              <code className="ml-2 bg-[var(--bg)] px-1 text-xs text-[var(--fg-soft)]">{secretLabel(k.prefix, k.lastFour)}</code>
              {k.legacyFullAccess && (
                <span className="ml-2 bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--amber)]">
                  Legacy full access — rotate
                </span>
              )}
              <p className="mt-1 text-[10px] text-[var(--fg-dim)]">
                {(k.scopes ?? []).join(", ") || "No scopes"}
                {k.expiresAt ? ` · expires ${k.expiresAt.toISOString()}` : " · no expiry"}
              </p>
            </div>
            <ApiKeyActions id={k.id} />
          </div>
        ))}
        {keys.length === 0 && <p className="p-3 text-sm text-[var(--fg-dim)]">No API keys yet.</p>}
      </div>

      <div className="space-y-4 border-t border-[var(--line)] pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-mono text-sm font-semibold text-[var(--fg)]">Outbound Webhooks</h2>
          <div className="w-full sm:w-56">
            <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/api-keys" selected={pageId} />
          </div>
        </div>
        <p className="text-sm text-[var(--fg-soft)]">
          Every incident/maintenance/postmortem event for this page is POSTed as JSON to each active endpoint below.
        </p>
        {pageId && (
          <WebhookEndpointManager
            pageId={pageId}
            endpoints={webhookEndpoints.map((endpoint) => ({
              id: endpoint.id,
              url: endpoint.url,
              secretLabel: secretLabel(endpoint.secretPrefix, endpoint.secretLastFour),
              verifiedAt: endpoint.verifiedAt?.toISOString() ?? null,
            }))}
          />
        )}
      </div>

      <div className="space-y-4 border-t border-[var(--line)] pt-6">
        <h2 className="font-mono text-sm font-semibold text-[var(--fg)]">Protected Feed Tokens</h2>
        <p className="text-sm text-[var(--fg-soft)]">
          Private and audience pages use revocable, optionally component-scoped tokens for RSS, Atom, embeds, and public API reads.
        </p>
        {selectedPage?.type === "PUBLIC" ? (
          <p className="border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--fg-soft)]">
            This page is public and its RSS and Atom feeds do not require a token.
          </p>
        ) : selectedPage ? (
          <FeedTokenManager
            pageId={selectedPage.id}
            pageSlug={selectedPage.slug}
            components={pageComponents.map((component) => ({ id: component.id, name: component.name }))}
            tokens={feedTokens.map((token) => ({
              id: token.id,
              name: token.name,
              label: secretLabel(token.prefix, token.lastFour),
              expiresAt: token.expiresAt?.toISOString() ?? null,
              lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
            }))}
          />
        ) : null}
      </div>
    </div>
  );
}
