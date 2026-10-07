"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { BellRing } from "lucide-react";

const CHANNELS = [
  {
    value: "SLACK",
    label: "Slack",
    group: "Chat",
    description: "Send updates through a Slack incoming webhook.",
    fields: [{ key: "url", label: "Incoming webhook URL", required: true }],
  },
  {
    value: "MICROSOFT_TEAMS",
    label: "Microsoft Teams",
    group: "Chat",
    description: "Post an Adaptive Card through a Teams workflow webhook.",
    fields: [{ key: "url", label: "Workflow webhook URL", required: true }],
  },
  {
    value: "DISCORD",
    label: "Discord",
    group: "Chat",
    description: "Publish incident updates to a Discord channel webhook.",
    fields: [{ key: "url", label: "Incoming webhook URL", required: true }],
  },
  {
    value: "GOOGLE_CHAT",
    label: "Google Chat",
    group: "Chat",
    description: "Post updates to a Google Chat space webhook.",
    fields: [{ key: "url", label: "Incoming webhook URL", required: true }],
  },
  {
    value: "TELEGRAM",
    label: "Telegram",
    group: "Messaging",
    description: "Send updates with a Telegram bot to a chat or channel.",
    fields: [
      { key: "botToken", label: "Bot token", required: true, sensitive: true },
      { key: "chatId", label: "Chat ID", required: true },
    ],
  },
  {
    value: "WHATSAPP",
    label: "WhatsApp",
    group: "Messaging",
    description: "Deliver updates through a Twilio WhatsApp sender.",
    fields: [
      { key: "accountSid", label: "Twilio account SID", required: true, sensitive: true },
      { key: "authToken", label: "Twilio auth token", required: true, sensitive: true },
      { key: "from", label: "From number", required: true },
      { key: "to", label: "To number", required: true },
    ],
  },
  {
    value: "PAGERDUTY",
    label: "PagerDuty",
    group: "On-call",
    description: "Trigger or resolve incidents through Events API v2.",
    fields: [
      { key: "routingKey", label: "Events routing key", required: true, sensitive: true },
      { key: "severity", label: "Severity (defaults to warning)", required: false },
    ],
  },
  {
    value: "OPSGENIE",
    label: "Opsgenie",
    group: "On-call",
    description: "Create alerts with the US or EU Opsgenie Alerts API.",
    fields: [
      { key: "apiKey", label: "API key", required: true, sensitive: true },
      { key: "region", label: "Region (us or eu)", required: false },
    ],
  },
  {
    value: "NTFY",
    label: "Ntfy",
    group: "Push",
    description: "Publish to ntfy.sh or your own ntfy server.",
    fields: [
      { key: "serverUrl", label: "Server URL (defaults to ntfy.sh)", required: false },
      { key: "topic", label: "Topic", required: true },
      { key: "token", label: "Access token (optional)", required: false, sensitive: true },
    ],
  },
] as const;

type Destination = {
  id: string;
  name: string;
  channel: string;
  active: boolean;
  verifiedAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
};

export function NotificationDestinationManager({
  pageId,
  initial,
  enabledChannels,
}: {
  pageId: string;
  initial: Destination[];
  enabledChannels?: readonly string[];
}) {
  const availableProviders = CHANNELS.filter(
    (provider) => !enabledChannels || enabledChannels.includes(provider.value)
  );
  const [destinations, setDestinations] = useState(initial);
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["value"]>(
    availableProviders[0]?.value ?? "SLACK"
  );
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const selectedProvider =
    availableProviders.find((provider) => provider.value === channel) ??
    availableProviders[0];

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || pendingAction) return;
    // "Send test" delivers the verification message without saving.
    const dryRun = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "test";
    setLoading(true);
    setMessageIsError(false);
    setMessage("Testing destination…");

    try {
      const response = await fetchWithTimeout("/api/admin/notification-destinations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId, name, channel, config, dryRun }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageIsError(true);
        setMessage(data.error?.message ?? "Destination could not be added");
        return;
      }
      if (dryRun) {
        setMessage(`Test message delivered to ${selectedProvider?.label ?? "the destination"}. Nothing was saved yet.`);
        return;
      }
      setDestinations((items) => [...items, { ...data.destination, lastTestOk: true, lastError: null }]);
      setName("");
      setConfig({});
      setMessage("Destination verified and enabled.");
    } catch {
      setMessageIsError(true);
      setMessage("Unable to add the destination. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function mutate(id: string, action: "test" | "toggle" | "delete") {
    if (loading || pendingAction) return;
    setPendingAction(`${action}:${id}`);
    setMessageIsError(false);
    setMessage(null);

    try {
      const response = await fetchWithTimeout(
        action === "delete" ? `/api/admin/notification-destinations?id=${id}` : "/api/admin/notification-destinations",
        {
          method: action === "delete" ? "DELETE" : "PATCH",
          headers: { "content-type": "application/json" },
          ...(action === "delete" ? {} : { body: JSON.stringify({ id, action }) }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (action === "test") {
          const failure = data.error?.message ?? "Connection test failed";
          setDestinations((items) => items.map((item) => item.id === id ? { ...item, lastTestOk: false, lastError: failure } : item));
        }
        setMessageIsError(true);
        setMessage(data.error?.message ?? "Action failed");
        return;
      }
      if (action === "delete") setDestinations((items) => items.filter((item) => item.id !== id));
      if (action === "toggle") setDestinations((items) => items.map((item) => item.id === id ? { ...item, active: !item.active } : item));
      if (action === "test") {
        setDestinations((items) => items.map((item) => item.id === id ? { ...item, verifiedAt: new Date().toISOString(), lastTestOk: true, lastError: null } : item));
        setMessage("Test delivered successfully.");
      }
    } catch {
      setMessageIsError(true);
      setMessage("Unable to update the destination. Check your connection and try again.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-5">
      {selectedProvider ? (
      <form onSubmit={create} className="space-y-5">
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Choose a provider</legend>
          <p className="mt-1 text-xs leading-5 text-ink-dim">SignalHub sends a live verification message before saving the destination.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableProviders.map((provider) => {
              const selected = provider.value === channel;
              return (
                <Button
                  key={provider.value}
                  type="button"
                  data-button-guard="off"
                  aria-pressed={selected}
                  onClick={() => {
                    setChannel(provider.value);
                    setConfig({});
                    setMessage(null);
                  }}
                  variant="ghost"
                  className={`h-auto min-w-0 flex-col items-start justify-start whitespace-normal rounded-control border p-3 text-left transition-colors ${selected ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong"}`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{provider.label}</span>
                    <span className="text-xs font-normal text-ink-dim">{provider.group}</span>
                  </span>
                  <span className="mt-1 block w-full break-words text-xs font-normal leading-5 text-ink-dim">{provider.description}</span>
                </Button>
              );
            })}
          </div>
        </fieldset>

        <div className="border-t border-line pt-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-ink">Configure {selectedProvider.label}</p>
            <p className="mt-1 text-xs text-ink-dim">Credentials are encrypted at rest and are never displayed again.</p>
          </div>
          <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Destination name
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={`e.g. ${selectedProvider.label} incidents`} className="font-normal" required />
            </label>
            {selectedProvider.fields.map((field) => (
              <label key={field.key} className="grid gap-1.5 text-sm font-medium text-ink-soft">
                {field.label}
                <Input
                  type={"sensitive" in field && field.sensitive ? "password" : "text"}
                  value={config[field.key] ?? ""}
                  onChange={(event) => setConfig({ ...config, [field.key]: event.target.value })}
                  placeholder={field.label}
                  className="font-normal"
                  required={field.required}
                  autoComplete="off"
                />
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-col-reverse justify-end gap-2 border-t border-line pt-4 sm:flex-row">
          <Button type="submit" name="intent" value="test" variant="secondary" disabled={loading || Boolean(pendingAction)} className="w-full sm:w-auto">
            Send test
          </Button>
          <Button type="submit" name="intent" value="add" loading={loading} disabled={Boolean(pendingAction)} className="w-full sm:w-auto">
            {loading ? `Testing ${selectedProvider.label}…` : `Test and add ${selectedProvider.label}`}
          </Button>
        </div>
      </form>
      ) : (
        <Alert tone="warn">
          No team notification providers are enabled for this installation. Ask a platform administrator to enable providers in Platform configuration.
        </Alert>
      )}
      {message && (
        <p
          role={messageIsError ? "alert" : "status"}
          className={`text-sm ${messageIsError ? "text-danger-fg" : "text-ink-soft"}`}
        >
          {message}
        </p>
      )}
      {destinations.length > 0 ? <ul className="divide-y divide-line border-t border-line">
        {destinations.map((destination) => (
          <li key={destination.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-ink">{destination.name}</p>
                <StatusBadge tone={destination.active && destination.verifiedAt ? "ok" : destination.active ? "warn" : "neutral"}>{destination.active && destination.verifiedAt ? "Verified" : destination.active ? "Unverified" : "Paused"}</StatusBadge>
              </div>
              <p className="mt-1 text-xs text-ink-dim">{CHANNELS.find((provider) => provider.value === destination.channel)?.label ?? destination.channel.replaceAll("_", " ")}</p>
              {destination.lastError && <p className="mt-1 text-xs text-danger-fg">{destination.lastError}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" loading={pendingAction === `test:${destination.id}`} disabled={Boolean(pendingAction)} onClick={() => void mutate(destination.id, "test")}>
                {pendingAction === `test:${destination.id}` ? "Sending…" : "Send test"}
              </Button>
              <Button type="button" variant="outline" size="sm" loading={pendingAction === `toggle:${destination.id}`} disabled={Boolean(pendingAction)} onClick={() => void mutate(destination.id, "toggle")}>
                {pendingAction === `toggle:${destination.id}` ? "Saving…" : destination.active ? "Pause" : "Enable"}
              </Button>
              <Button type="button" variant="destructive" size="sm" loading={pendingAction === `delete:${destination.id}`} disabled={Boolean(pendingAction)} onClick={() => void mutate(destination.id, "delete")}>
                {pendingAction === `delete:${destination.id}` ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </li>
        ))}
      </ul> : <EmptyState icon={BellRing} hue="teal" title="No team destinations configured" description="Choose a provider above to send incident updates to your team." className="border-0 border-t border-line bg-transparent py-8" />}
    </div>
  );
}
