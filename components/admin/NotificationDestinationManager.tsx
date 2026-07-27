"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";

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

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (loading || pendingAction) return;
    setLoading(true);
    setMessageIsError(false);
    setMessage("Testing destination…");

    try {
      const response = await fetchWithTimeout("/api/admin/notification-destinations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId, name, channel, config }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageIsError(true);
        setMessage(data.error?.message ?? "Destination could not be added");
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
      <form onSubmit={create} className="space-y-5 border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <fieldset>
          <legend className="text-sm font-semibold text-[var(--fg)]">Choose a provider</legend>
          <p className="mt-1 text-xs leading-5 text-[var(--fg-dim)]">SignalHub sends a live verification message before saving the destination.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableProviders.map((provider) => {
              const selected = provider.value === channel;
              return (
                <button
                  key={provider.value}
                  type="button"
                  data-button-guard="off"
                  aria-pressed={selected}
                  onClick={() => {
                    setChannel(provider.value);
                    setConfig({});
                    setMessage(null);
                  }}
                  className={`min-w-0 border p-3 text-left transition-colors ${selected ? "border-[var(--cyan)] bg-[var(--cyan-soft)]" : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--line-bright)]"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--fg)]">{provider.label}</span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--fg-dim)]">{provider.group}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--fg-dim)]">{provider.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="border-t border-[var(--line)] pt-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[var(--fg)]">Configure {selectedProvider.label}</p>
            <p className="mt-1 text-xs text-[var(--fg-dim)]">Credentials are encrypted at rest and are never displayed again.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
              Destination name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`e.g. ${selectedProvider.label} incidents`} className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)]" required />
            </label>
            {selectedProvider.fields.map((field) => (
              <label key={field.key} className="grid gap-1.5 text-xs font-semibold text-[var(--fg-soft)]">
                {field.label}
                <input
                  type={"sensitive" in field && field.sensitive ? "password" : "text"}
                  value={config[field.key] ?? ""}
                  onChange={(event) => setConfig({ ...config, [field.key]: event.target.value })}
                  placeholder={field.label}
                  className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm font-normal text-[var(--fg)] placeholder:text-[var(--fg-dim)]"
                  required={field.required}
                  autoComplete="off"
                />
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end border-t border-[var(--line)] pt-4">
          <button disabled={loading || Boolean(pendingAction)} className="w-full bg-[var(--cyan)] px-4 py-2.5 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50 sm:w-auto">
            {loading ? `Testing ${selectedProvider.label}…` : `Test and add ${selectedProvider.label}`}
          </button>
        </div>
      </form>
      ) : (
        <div className="border border-[var(--amber)]/30 bg-[var(--amber-soft)] p-4 text-sm text-[var(--fg-soft)]">
          No team notification providers are enabled for this installation. Ask a platform administrator to enable providers in Platform configuration.
        </div>
      )}
      {message && (
        <p
          role={messageIsError ? "alert" : "status"}
          className={`text-sm ${messageIsError ? "text-[var(--red)]" : "text-[var(--fg-soft)]"}`}
        >
          {message}
        </p>
      )}
      <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--surface)]">
        {destinations.map((destination) => (
          <div key={destination.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-[var(--fg)]">{destination.name}</p>
                <span className={`px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${destination.active && destination.verifiedAt ? "bg-[var(--green-soft)] text-[var(--green)]" : "bg-[var(--surface-raised)] text-[var(--fg-dim)]"}`}>
                  {destination.active && destination.verifiedAt ? "Verified" : destination.active ? "Unverified" : "Paused"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--fg-dim)]">{CHANNELS.find((provider) => provider.value === destination.channel)?.label ?? destination.channel.replaceAll("_", " ")}</p>
              {destination.lastError && <p className="mt-1 text-xs text-[var(--red)]">{destination.lastError}</p>}
            </div>
            <div className="flex gap-2">
              <button disabled={loading || Boolean(pendingAction)} onClick={() => void mutate(destination.id, "test")} className="border border-[var(--line)] px-2.5 py-1 text-xs disabled:opacity-50">
                {pendingAction === `test:${destination.id}` ? "Sending…" : "Send test"}
              </button>
              <button disabled={loading || Boolean(pendingAction)} onClick={() => void mutate(destination.id, "toggle")} className="border border-[var(--line)] px-2.5 py-1 text-xs disabled:opacity-50">
                {pendingAction === `toggle:${destination.id}` ? "Saving…" : destination.active ? "Pause" : "Enable"}
              </button>
              <button disabled={loading || Boolean(pendingAction)} onClick={() => void mutate(destination.id, "delete")} className="border border-[var(--red)]/30 px-2.5 py-1 text-xs text-[var(--red)] disabled:opacity-50">
                {pendingAction === `delete:${destination.id}` ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ))}
        {!destinations.length && <p className="p-6 text-center text-sm text-[var(--fg-dim)]">No team destinations configured.</p>}
      </div>
    </div>
  );
}
