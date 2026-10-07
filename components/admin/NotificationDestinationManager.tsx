"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import {
  defaultConfig,
  DESTINATION_CHANNELS,
  type DestinationDefaults,
  DESTINATION_EVENT_TYPES,
  DESTINATION_PROVIDERS,
  fieldVisible,
  type DestinationChannel,
} from "@/lib/destination-catalog";
import { BellRing } from "lucide-react";

const CHANNELS = DESTINATION_CHANNELS.map((value) => ({ value, ...DESTINATION_PROVIDERS[value] }));

type Destination = {
  id: string;
  name: string;
  channel: string;
  active: boolean;
  verifiedAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  eventTypes: string[];
  componentIds: string[] | null;
};

export function NotificationDestinationManager({
  pageId,
  initial,
  enabledChannels,
  components = [],
  defaults = {},
  sharedChannels = [],
}: {
  pageId: string;
  initial: Destination[];
  enabledChannels?: readonly string[];
  components?: Array<{ id: string; name: string }>;
  /** Installation-wide defaults set by the platform administrator. */
  defaults?: DestinationDefaults;
  /** Providers the platform administrator connected once for every organization; credentials never reach the browser. */
  sharedChannels?: readonly string[];
}) {
  const availableProviders = CHANNELS.filter(
    (provider) => !enabledChannels || enabledChannels.includes(provider.value)
  );
  const [destinations, setDestinations] = useState(initial);
  const [channel, setChannel] = useState<DestinationChannel>(
    availableProviders[0]?.value ?? "SLACK"
  );
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, string>>(() => defaultConfig(availableProviders[0]?.value ?? "SLACK", defaults));
  const [ownCredentials, setOwnCredentials] = useState(false);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const selectedProvider =
    availableProviders.find((provider) => provider.value === channel) ??
    availableProviders[0];
  const usePlatformConnection = sharedChannels.includes(channel) && !ownCredentials;

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
        body: JSON.stringify({ pageId, name, channel, config, dryRun, usePlatformConnection, eventTypes, componentIds }),
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
      setDestinations((items) => [...items, { ...data.destination, lastTestOk: true, lastError: null, eventTypes, componentIds: componentIds.length ? componentIds : null }]);
      setName("");
      setConfig(defaultConfig(channel, defaults));
      setEventTypes([]);
      setComponentIds([]);
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
                    setConfig(defaultConfig(provider.value, defaults));
                    setOwnCredentials(false);
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
            {sharedChannels.includes(channel) && (
              <label className="flex items-start gap-2.5 rounded-control border border-line bg-sunken/50 p-3 text-sm text-ink sm:col-span-2">
                <Checkbox checked={!ownCredentials} onChange={(change) => setOwnCredentials(!change.target.checked)} className="mt-0.5" />
                <span>
                  <span className="font-medium">Use the platform connection</span>
                  <span className="mt-0.5 block text-xs leading-5 text-ink-dim">Your platform administrator connected {selectedProvider.label} for every organization. Untick to connect your own account instead.</span>
                </span>
              </label>
            )}
            {!usePlatformConnection && selectedProvider.fields.filter((field) => fieldVisible(field, config)).map((field) => (
              <div key={field.key} className="grid content-start gap-1.5 text-sm font-medium text-ink-soft">
                <label htmlFor={`destination-${field.key}`}>{field.label}</label>
                {field.kind === "select" ? (
                  <Select
                    id={`destination-${field.key}`}
                    value={config[field.key] ?? field.defaultValue ?? ""}
                    onChange={(event) => setConfig({ ...config, [field.key]: event.target.value })}
                    className="w-full font-normal"
                  >
                    {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                ) : (
                  <Input
                    id={`destination-${field.key}`}
                    type={field.kind === "secret" ? "password" : field.kind === "url" ? "url" : "text"}
                    value={config[field.key] ?? ""}
                    onChange={(event) => setConfig({ ...config, [field.key]: event.target.value })}
                    placeholder={field.placeholder ?? field.label}
                    className="font-normal"
                    required={field.required}
                    autoComplete="off"
                  />
                )}
                {field.hint && <p className="text-xs font-normal leading-5 text-ink-dim">{field.hint}</p>}
              </div>
            ))}
          </div>
        </div>
        <details className="group rounded-control border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Filters <span className="font-normal text-ink-dim">({eventTypes.length ? `${eventTypes.length} events` : "all events"}, {componentIds.length ? `${componentIds.length} components` : "all components"})</span>
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-ink-dim">Events</legend>
              <p className="mt-1 text-xs text-ink-dim">Leave all unchecked to receive every event.</p>
              <div className="mt-2 grid gap-1.5">
                {DESTINATION_EVENT_TYPES.map((event) => (
                  <label key={event.value} className="flex items-center gap-2 text-sm text-ink">
                    <Checkbox
                      checked={eventTypes.includes(event.value)}
                      onChange={(change) => setEventTypes((current) => change.target.checked ? [...current, event.value] : current.filter((value) => value !== event.value))}
                    />
                    {event.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-ink-dim">Components</legend>
              <p className="mt-1 text-xs text-ink-dim">Only events affecting these components. Page-wide events are always sent.</p>
              <div className="mt-2 grid gap-1.5">
                {components.length ? components.map((component) => (
                  <label key={component.id} className="flex items-center gap-2 text-sm text-ink">
                    <Checkbox
                      checked={componentIds.includes(component.id)}
                      onChange={(change) => setComponentIds((current) => change.target.checked ? [...current, component.id] : current.filter((value) => value !== component.id))}
                    />
                    {component.name}
                  </label>
                )) : <p className="text-sm text-ink-dim">This page has no components.</p>}
              </div>
            </fieldset>
          </div>
        </details>
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
              <p className="mt-0.5 text-xs text-ink-dim">
                {destination.eventTypes.length ? `${destination.eventTypes.length} event types` : "All events"}
                {destination.componentIds?.length ? ` · ${destination.componentIds.length} components` : ""}
              </p>
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
