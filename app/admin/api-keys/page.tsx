import { requireSession } from "@/lib/require-session";
import { prisma } from "@/lib/db";
import { createApiKey, revokeApiKey, createWebhookEndpoint, deleteWebhookEndpoint } from "./actions";
import { PageSelect } from "@/components/admin/PageSelect";

export default async function ApiKeysPage({ searchParams }: { searchParams: Promise<{ pageId?: string }> }) {
  const { org } = await requireSession();
  const { pageId: pageIdParam } = await searchParams;
  const keys = await prisma.apiKey.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
  const pages = await prisma.page.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
  const pageId = pageIdParam && pages.some((p) => p.id === pageIdParam) ? pageIdParam : pages[0]?.id;
  const webhookEndpoints = pageId ? await prisma.webhookEndpoint.findMany({ where: { pageId } }) : [];
  const boundCreateWebhook = pageId ? createWebhookEndpoint.bind(null, pageId) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">API Keys &amp; Webhooks</h1>
      <p className="text-sm text-gray-500">
        Use these keys to authenticate programmatic access to the Management API. Pass as{" "}
        <code className="bg-gray-100 px-1 rounded">Authorization: Bearer &lt;key&gt;</code>. See{" "}
        <code className="bg-gray-100 px-1 rounded">/api/v1/manage/*</code> endpoints.
      </p>

      <form action={createApiKey} className="bg-white border rounded-lg p-4 flex gap-2">
        <input name="name" placeholder="Key name (e.g. CI pipeline)" className="flex-1 border rounded-md px-3 py-2 text-sm" required />
        <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium">Generate Key</button>
      </form>

      <div className="bg-white border rounded-lg divide-y">
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-medium">{k.name}</span>
              <code className="text-xs text-gray-500 ml-2 bg-gray-50 px-1 rounded">{k.key}</code>
            </div>
            <form action={revokeApiKey.bind(null, k.id)}>
              <button className="text-xs text-red-600 hover:underline">Revoke</button>
            </form>
          </div>
        ))}
        {keys.length === 0 && <p className="p-3 text-sm text-gray-400">No API keys yet.</p>}
      </div>

      <div className="pt-6 border-t space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Outbound Webhooks</h2>
          <div className="w-56">
            <PageSelect pages={pages.map((p) => ({ id: p.id, name: p.name }))} basePath="/admin/api-keys" selected={pageId} />
          </div>
        </div>
        <p className="text-sm text-gray-500">Every incident/maintenance/postmortem event for this page is POSTed as JSON to each active endpoint below.</p>
        {boundCreateWebhook && (
          <form action={boundCreateWebhook} className="flex gap-2">
            <input name="url" placeholder="https://example.com/webhook" className="flex-1 border rounded-md px-3 py-2 text-sm" required />
            <button className="bg-gray-800 text-white rounded-md px-4 py-2 text-sm font-medium">Add Endpoint</button>
          </form>
        )}
        <div className="bg-white border rounded-lg divide-y">
          {webhookEndpoints.map((ep) => (
            <div key={ep.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <span className="font-medium">{ep.url}</span>
                <code className="text-xs text-gray-500 ml-2 bg-gray-50 px-1 rounded">secret: {ep.secret}</code>
              </div>
              <form action={deleteWebhookEndpoint.bind(null, ep.id)}>
                <button className="text-xs text-red-600 hover:underline">Delete</button>
              </form>
            </div>
          ))}
          {webhookEndpoints.length === 0 && <p className="p-3 text-sm text-gray-400">No webhook endpoints yet.</p>}
        </div>
      </div>
    </div>
  );
}
