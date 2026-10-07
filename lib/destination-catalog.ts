/**
 * Team destination providers: one definition drives the admin form, the API
 * validation and the platform policy screen. Client-safe (no server imports).
 */

export const DESTINATION_CHANNELS = [
  "SLACK",
  "MICROSOFT_TEAMS",
  "DISCORD",
  "GOOGLE_CHAT",
  "MATTERMOST",
  "ROCKET_CHAT",
  "WEBEX",
  "ZULIP",
  "TELEGRAM",
  "WHATSAPP",
  "PAGERDUTY",
  "OPSGENIE",
  "SPLUNK_ON_CALL",
  "NTFY",
  "PUSHOVER",
  "GOTIFY",
  "HTTP",
] as const;

export type DestinationChannel = (typeof DESTINATION_CHANNELS)[number];

export type ProviderField = {
  key: string;
  label: string;
  /** "url" fields must be public HTTPS URLs; "secret" fields are masked and never shown again. */
  kind?: "text" | "secret" | "url" | "select";
  required?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  /** Only shown, validated and stored when another field has one of these values. */
  when?: { field: string; is: readonly string[] };
};

export type DestinationProvider = {
  label: string;
  group: "Chat" | "Messaging" | "On-call" | "Push" | "Custom";
  description: string;
  fields: readonly ProviderField[];
};

const PRIORITY_3 = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
] as const;

export const DESTINATION_PROVIDERS: Record<DestinationChannel, DestinationProvider> = {
  SLACK: {
    label: "Slack",
    group: "Chat",
    description: "Post to a channel with an incoming webhook or a bot token.",
    fields: [
      { key: "auth", label: "Connect with", kind: "select", defaultValue: "webhook", options: [
        { value: "webhook", label: "Incoming webhook" },
        { value: "bot", label: "Bot token (chat:write)" },
      ] },
      { key: "url", label: "Incoming webhook URL", kind: "url", required: true, placeholder: "https://hooks.slack.com/services/…", when: { field: "auth", is: ["webhook"] } },
      { key: "botToken", label: "Bot token", kind: "secret", required: true, placeholder: "xoxb-…", when: { field: "auth", is: ["bot"] } },
      { key: "channel", label: "Channel ID", required: true, placeholder: "C0123456789", hint: "Invite the bot to the channel first.", when: { field: "auth", is: ["bot"] } },
    ],
  },
  MICROSOFT_TEAMS: {
    label: "Microsoft Teams",
    group: "Chat",
    description: "Post an Adaptive Card through a Teams workflow webhook.",
    fields: [
      { key: "url", label: "Workflow webhook URL", kind: "url", required: true, hint: "The signed URL already authenticates the request." },
    ],
  },
  DISCORD: {
    label: "Discord",
    group: "Chat",
    description: "Publish to a channel with a webhook or a bot token.",
    fields: [
      { key: "auth", label: "Connect with", kind: "select", defaultValue: "webhook", options: [
        { value: "webhook", label: "Channel webhook" },
        { value: "bot", label: "Bot token" },
      ] },
      { key: "url", label: "Webhook URL", kind: "url", required: true, placeholder: "https://discord.com/api/webhooks/…", when: { field: "auth", is: ["webhook"] } },
      { key: "username", label: "Display name (optional)", placeholder: "Status", when: { field: "auth", is: ["webhook"] } },
      { key: "botToken", label: "Bot token", kind: "secret", required: true, when: { field: "auth", is: ["bot"] } },
      { key: "channelId", label: "Channel ID", required: true, when: { field: "auth", is: ["bot"] } },
    ],
  },
  GOOGLE_CHAT: {
    label: "Google Chat",
    group: "Chat",
    description: "Post updates to a Google Chat space webhook.",
    fields: [
      { key: "url", label: "Space webhook URL", kind: "url", required: true, hint: "The key and token in the URL authenticate the request." },
    ],
  },
  MATTERMOST: {
    label: "Mattermost",
    group: "Chat",
    description: "Post with an incoming webhook or a bot access token.",
    fields: [
      { key: "auth", label: "Connect with", kind: "select", defaultValue: "webhook", options: [
        { value: "webhook", label: "Incoming webhook" },
        { value: "token", label: "Bot access token" },
      ] },
      { key: "url", label: "Incoming webhook URL", kind: "url", required: true, when: { field: "auth", is: ["webhook"] } },
      { key: "serverUrl", label: "Server URL", kind: "url", required: true, placeholder: "https://chat.example.com", when: { field: "auth", is: ["token"] } },
      { key: "token", label: "Bot access token", kind: "secret", required: true, when: { field: "auth", is: ["token"] } },
      { key: "channelId", label: "Channel ID", required: true, when: { field: "auth", is: ["token"] } },
    ],
  },
  ROCKET_CHAT: {
    label: "Rocket.Chat",
    group: "Chat",
    description: "Post through a Rocket.Chat incoming webhook integration.",
    fields: [
      { key: "url", label: "Incoming webhook URL", kind: "url", required: true, hint: "The token in the URL authenticates the request." },
    ],
  },
  WEBEX: {
    label: "Webex",
    group: "Chat",
    description: "Send messages to a Webex space with a bot.",
    fields: [
      { key: "botToken", label: "Bot access token", kind: "secret", required: true },
      { key: "roomId", label: "Space (room) ID", required: true, hint: "Add the bot to the space first." },
    ],
  },
  ZULIP: {
    label: "Zulip",
    group: "Chat",
    description: "Post to a Zulip stream topic with a bot account.",
    fields: [
      { key: "siteUrl", label: "Zulip URL", kind: "url", required: true, placeholder: "https://example.zulipchat.com" },
      { key: "botEmail", label: "Bot email", required: true },
      { key: "apiKey", label: "Bot API key", kind: "secret", required: true },
      { key: "stream", label: "Stream", required: true },
      { key: "topic", label: "Topic", defaultValue: "Status updates" },
    ],
  },
  TELEGRAM: {
    label: "Telegram",
    group: "Messaging",
    description: "Send updates with a Telegram bot to a chat or channel.",
    fields: [
      { key: "botToken", label: "Bot token", kind: "secret", required: true },
      { key: "chatId", label: "Chat ID", required: true },
      { key: "messageThreadId", label: "Topic thread ID (optional)", hint: "For forum-style groups." },
    ],
  },
  WHATSAPP: {
    label: "WhatsApp",
    group: "Messaging",
    description: "Deliver updates through a Twilio WhatsApp sender.",
    fields: [
      { key: "accountSid", label: "Twilio account SID", kind: "secret", required: true },
      { key: "authToken", label: "Twilio auth token", kind: "secret", required: true },
      { key: "from", label: "From number", required: true, placeholder: "+15551234567" },
      { key: "to", label: "To number", required: true, placeholder: "+15557654321" },
    ],
  },
  PAGERDUTY: {
    label: "PagerDuty",
    group: "On-call",
    description: "Trigger and resolve incidents through Events API v2.",
    fields: [
      { key: "routingKey", label: "Integration (routing) key", kind: "secret", required: true },
      { key: "severity", label: "Severity", kind: "select", defaultValue: "warning", options: [
        { value: "critical", label: "Critical" },
        { value: "error", label: "Error" },
        { value: "warning", label: "Warning" },
        { value: "info", label: "Info" },
      ] },
    ],
  },
  OPSGENIE: {
    label: "Opsgenie",
    group: "On-call",
    description: "Create and close alerts with the Opsgenie Alerts API.",
    fields: [
      { key: "apiKey", label: "API integration key", kind: "secret", required: true },
      { key: "region", label: "Region", kind: "select", defaultValue: "us", options: [
        { value: "us", label: "US" },
        { value: "eu", label: "EU" },
      ] },
      { key: "priority", label: "Priority", kind: "select", defaultValue: "P3", options: [
        { value: "P1", label: "P1 – Critical" },
        { value: "P2", label: "P2 – High" },
        { value: "P3", label: "P3 – Moderate" },
        { value: "P4", label: "P4 – Low" },
        { value: "P5", label: "P5 – Informational" },
      ] },
    ],
  },
  SPLUNK_ON_CALL: {
    label: "Splunk On-Call",
    group: "On-call",
    description: "Open and recover incidents with the VictorOps REST endpoint.",
    fields: [
      { key: "url", label: "REST endpoint URL", kind: "url", required: true, placeholder: "https://alert.victorops.com/integrations/generic/20131114/alert/…/…", hint: "Includes your API key and routing key." },
    ],
  },
  NTFY: {
    label: "Ntfy",
    group: "Push",
    description: "Publish to ntfy.sh or your own ntfy server.",
    fields: [
      { key: "serverUrl", label: "Server URL", kind: "url", placeholder: "https://ntfy.sh", hint: "Leave blank for ntfy.sh." },
      { key: "topic", label: "Topic", required: true },
      { key: "auth", label: "Authentication", kind: "select", defaultValue: "none", options: [
        { value: "none", label: "None (public topic)" },
        { value: "token", label: "Access token" },
        { value: "basic", label: "Username and password" },
      ] },
      { key: "token", label: "Access token", kind: "secret", required: true, placeholder: "tk_…", when: { field: "auth", is: ["token"] } },
      { key: "username", label: "Username", required: true, when: { field: "auth", is: ["basic"] } },
      { key: "password", label: "Password", kind: "secret", required: true, when: { field: "auth", is: ["basic"] } },
      { key: "priority", label: "Priority", kind: "select", defaultValue: "default", options: [
        { value: "min", label: "Min" },
        { value: "low", label: "Low" },
        { value: "default", label: "Default" },
        { value: "high", label: "High" },
        { value: "urgent", label: "Urgent" },
      ] },
    ],
  },
  PUSHOVER: {
    label: "Pushover",
    group: "Push",
    description: "Push notifications to Pushover users or groups.",
    fields: [
      { key: "appToken", label: "Application API token", kind: "secret", required: true },
      { key: "userKey", label: "User or group key", kind: "secret", required: true },
      { key: "priority", label: "Priority", kind: "select", defaultValue: "normal", options: PRIORITY_3 },
    ],
  },
  GOTIFY: {
    label: "Gotify",
    group: "Push",
    description: "Push to a self-hosted Gotify server.",
    fields: [
      { key: "serverUrl", label: "Server URL", kind: "url", required: true, placeholder: "https://gotify.example.com" },
      { key: "appToken", label: "Application token", kind: "secret", required: true },
      { key: "priority", label: "Priority", kind: "select", defaultValue: "normal", options: PRIORITY_3 },
    ],
  },
  HTTP: {
    label: "Custom HTTP",
    group: "Custom",
    description: "POST JSON events to any HTTPS endpoint, with optional auth.",
    fields: [
      { key: "url", label: "Endpoint URL", kind: "url", required: true },
      { key: "auth", label: "Authentication", kind: "select", defaultValue: "none", options: [
        { value: "none", label: "None" },
        { value: "bearer", label: "Bearer token" },
        { value: "basic", label: "Basic (username and password)" },
        { value: "header", label: "Custom header" },
      ] },
      { key: "token", label: "Bearer token", kind: "secret", required: true, when: { field: "auth", is: ["bearer"] } },
      { key: "username", label: "Username", required: true, when: { field: "auth", is: ["basic"] } },
      { key: "password", label: "Password", kind: "secret", required: true, when: { field: "auth", is: ["basic"] } },
      { key: "headerName", label: "Header name", required: true, placeholder: "X-API-Key", when: { field: "auth", is: ["header"] } },
      { key: "headerValue", label: "Header value", kind: "secret", required: true, when: { field: "auth", is: ["header"] } },
    ],
  },
};

/** Events a destination can be limited to; an empty selection means all of them. */
export const DESTINATION_EVENT_TYPES = [
  { value: "incident.created", label: "Incident opened" },
  { value: "incident.updated", label: "Incident updated" },
  { value: "incident.resolved", label: "Incident resolved" },
  { value: "postmortem.published", label: "Postmortem published" },
  { value: "maintenance.scheduled", label: "Maintenance scheduled" },
  { value: "maintenance.reminder", label: "Maintenance reminder" },
  { value: "maintenance.in_progress", label: "Maintenance started" },
  { value: "maintenance.verifying", label: "Maintenance verifying" },
  { value: "maintenance.completed", label: "Maintenance completed" },
  { value: "monitor.down", label: "Monitor down" },
  { value: "monitor.recovered", label: "Monitor recovered" },
] as const;

export function defaultConfig(channel: DestinationChannel) {
  return Object.fromEntries(
    DESTINATION_PROVIDERS[channel].fields
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.key, field.defaultValue as string])
  );
}

/** `values` must already include the provider's defaults (see defaultConfig). */
export function fieldVisible(field: ProviderField, values: Record<string, string>) {
  return !field.when || field.when.is.includes(values[field.when.field] ?? "");
}

/**
 * Applies defaults, drops fields hidden by the chosen auth mode, and checks
 * required fields and select options. URL reachability is checked by the caller.
 */
export function normalizeDestinationConfig(channel: DestinationChannel, input: Record<string, string>) {
  const values: Record<string, string> = { ...defaultConfig(channel) };
  for (const [key, value] of Object.entries(input)) if (value.trim()) values[key] = value.trim();
  const output: Record<string, string> = {};
  for (const field of DESTINATION_PROVIDERS[channel].fields) {
    if (!fieldVisible(field, values)) continue;
    const value = values[field.key];
    if (!value) {
      if (field.required) throw new Error(`${field.label} is required`);
      continue;
    }
    if (field.kind === "select" && !field.options?.some((option) => option.value === value)) {
      throw new Error(`${field.label} has an unsupported value`);
    }
    output[field.key] = value;
  }
  return output;
}

/** What an on-call provider does for an event; null means it is informational and not paged. */
export function alertAction(eventType: string): "trigger" | "resolve" | null {
  if (["incident.created", "incident.updated", "monitor.down"].includes(eventType)) return "trigger";
  if (["incident.resolved", "monitor.recovered"].includes(eventType)) return "resolve";
  return null;
}
