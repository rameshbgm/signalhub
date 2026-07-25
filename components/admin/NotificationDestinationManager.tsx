"use client";

import { useState } from "react";

const CHANNELS = [
  ["SLACK", "Slack", [["url", "Incoming webhook URL"]]],
  ["MICROSOFT_TEAMS", "Microsoft Teams", [["url", "Incoming webhook URL"]]],
  ["DISCORD", "Discord", [["url", "Incoming webhook URL"]]],
  ["GOOGLE_CHAT", "Google Chat", [["url", "Incoming webhook URL"]]],
  ["TELEGRAM", "Telegram", [["botToken", "Bot token"], ["chatId", "Chat ID"]]],
  ["WHATSAPP", "WhatsApp", [["accountSid", "Account SID"], ["authToken", "Auth token"], ["from", "From number"], ["to", "To number"]]],
  ["PAGERDUTY", "PagerDuty", [["routingKey", "Events routing key"], ["severity", "Severity (optional)"]]],
  ["OPSGENIE", "Opsgenie", [["apiKey", "API key"], ["region", "Region: us or eu"]]],
  ["NTFY", "Ntfy", [["serverUrl", "Server URL (optional)"], ["topic", "Topic"], ["token", "Access token (optional)"]]],
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
}: {
  pageId: string;
  initial: Destination[];
}) {
  const [destinations, setDestinations] = useState(initial);
  const [channel, setChannel] = useState<(typeof CHANNELS)[number][0]>("SLACK");
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const fields = CHANNELS.find(([value]) => value === channel)![2];

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (loading || pendingAction) return;
    setLoading(true);
    setMessageIsError(false);
    setMessage("Testing destination…");

    try {
      const response = await fetch("/api/admin/notification-destinations", {
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
      const response = await fetch(
        action === "delete" ? `/api/admin/notification-destinations?id=${id}` : "/api/admin/notification-destinations",
        {
          method: action === "delete" ? "DELETE" : "PATCH",
          headers: { "content-type": "application/json" },
          ...(action === "delete" ? {} : { body: JSON.stringify({ id, action }) }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessageIsError(true);
        setMessage(data.error?.message ?? "Action failed");
        return;
      }
      if (action === "delete") setDestinations((items) => items.filter((item) => item.id !== id));
      if (action === "toggle") setDestinations((items) => items.map((item) => item.id === id ? { ...item, active: !item.active } : item));
      if (action === "test") setMessage("Test delivered successfully.");
    } catch {
      setMessageIsError(true);
      setMessage("Unable to update the destination. Check your connection and try again.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="space-y-3 border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Destination name" className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm" required />
          <select value={channel} onChange={(event) => { setChannel(event.target.value as typeof channel); setConfig({}); }} className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm">
            {CHANNELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {fields.map(([field, label]) => (
            <input
              key={field}
              type={/token|key|sid/i.test(field) ? "password" : "text"}
              value={config[field] ?? ""}
              onChange={(event) => setConfig({ ...config, [field]: event.target.value })}
              placeholder={label}
              className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          ))}
        </div>
        <button disabled={loading || Boolean(pendingAction)} className="bg-[var(--cyan)] px-4 py-2 text-sm font-semibold text-[var(--on-cyan)] disabled:opacity-50">
          {loading ? "Testing…" : "Test and add destination"}
        </button>
      </form>
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
            <div>
              <p className="font-medium">{destination.name}</p>
              <p className="text-xs text-[var(--fg-dim)]">{destination.channel.replaceAll("_", " ")} · {destination.active ? "enabled" : "paused"}</p>
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
