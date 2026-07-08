import Link from "next/link";
import { collections } from "@/lib/db";
import { oid, toId } from "@/lib/mongo-utils";
import { SetupStepper } from "@/components/admin/SetupStepper";
import { addSubscriber } from "@/app/admin/(protected)/subscribers/actions";
import { createWebhookEndpoint } from "@/app/admin/(protected)/api-keys/actions";

const CHANNELS = [
  { icon: "✉️", label: "Email", desc: "Verified via a one-time code sent to the inbox." },
  { icon: "💬", label: "SMS", desc: "Verified via a one-time code sent by text." },
  { icon: "🔷", label: "Slack", desc: "Post to a channel via an incoming webhook URL." },
  { icon: "🟪", label: "Microsoft Teams", desc: "Post to a channel via an incoming webhook URL." },
  { icon: "🪝", label: "Webhook", desc: "POST every event as JSON to your own endpoint." },
];

export default async function SetupNotificationsPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const endpoints = (await collections.webhookEndpoints().find({ pageId: oid(pageId) }).toArray()).map(toId);
  const boundAddSubscriber = addSubscriber.bind(null, pageId);
  const boundCreateWebhook = createWebhookEndpoint.bind(null, pageId);

  return (
    <div>
      <SetupStepper pageId={pageId} current="notifications" />
      <h1 className="text-2xl font-semibold">How subscribers get notified</h1>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed max-w-lg">
        Every incident and maintenance update can fan out across five channels. Set up an outbound webhook now, or skip and
        invite subscribers later from the Subscribers page.
      </p>

      <div className="mt-8 grid sm:grid-cols-2 gap-3">
        {CHANNELS.map((c) => (
          <div key={c.label} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <span className="text-xl leading-none">{c.icon}</span>
            <div>
              <p className="text-sm font-semibold">{c.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-sm mb-3">Add a webhook / Slack / Teams endpoint</h2>
        <form action={boundAddSubscriber} className="flex gap-2">
          <select name="channel" className="border rounded-md px-3 py-2 text-sm" defaultValue="SLACK">
            <option value="SLACK">Slack</option>
            <option value="MICROSOFT_TEAMS">Microsoft Teams</option>
            <option value="WEBHOOK">Webhook</option>
          </select>
          <input name="contact" placeholder="https://hooks.slack.com/services/..." className="flex-1 border rounded-md px-3 py-2 text-sm" required />
          <button className="bg-gray-800 text-white rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap">Add</button>
        </form>

        <h2 className="font-semibold text-sm mb-3 mt-6">Or register an outbound status-event webhook</h2>
        <form action={boundCreateWebhook} className="flex gap-2">
          <input name="url" placeholder="https://example.com/webhook-receiver" className="flex-1 border rounded-md px-3 py-2 text-sm" required />
          <button className="bg-gray-800 text-white rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap">Register</button>
        </form>
        {endpoints.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-gray-500">
            {endpoints.map((e) => (
              <li key={e.id}>{e.url}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-between items-center mt-12 pt-6 border-t">
        <Link href={`/admin/pages/${pageId}/setup/logo`} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back
        </Link>
        <div className="flex gap-3">
          <Link href={`/admin/pages/${pageId}/setup/team`} className="text-sm text-gray-500 hover:text-gray-800 self-center">
            Skip
          </Link>
          <Link href={`/admin/pages/${pageId}/setup/team`} className="bg-blue-600 text-white rounded-md px-5 py-2.5 text-sm font-medium">
            Next: Invite team →
          </Link>
        </div>
      </div>
    </div>
  );
}
