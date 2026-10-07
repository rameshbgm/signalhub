import type { NotificationDestinationRow } from "@/lib/postgres/schema";
import { getDeliveryConfig, type SmsConfig } from "@/lib/delivery-config";
import { decryptSecret } from "@/lib/encryption";
import { guardedFetch } from "@/lib/guarded-fetch";

type Message = { subject: string; body: string; eventType: string };

/** A provider answered with a non-2xx status; callers decide whether to retry. */
export class ProviderHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export const DESTINATION_CHANNELS = [
  "SLACK",
  "MICROSOFT_TEAMS",
  "DISCORD",
  "TELEGRAM",
  "WHATSAPP",
  "GOOGLE_CHAT",
  "PAGERDUTY",
  "OPSGENIE",
  "NTFY",
] as const;

export type DestinationChannel = (typeof DESTINATION_CHANNELS)[number];

async function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const contentType = headers["content-type"] ?? "application/json";
  const response = await guardedFetch(url, {
    method: "POST",
    headers: { "content-type": contentType, ...headers },
    body: contentType === "application/json" ? JSON.stringify(body) : String(body),
    signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000)),
  });
  if (!response.ok) throw new ProviderHttpError(`Provider returned HTTP ${response.status}`, response.status);
  return response.status;
}

function config(destination: NotificationDestinationRow) {
  const parsed: unknown = JSON.parse(decryptSecret(destination.configCiphertext));
  if (!parsed || typeof parsed !== "object") throw new Error("Destination configuration is invalid");
  return parsed as Record<string, string>;
}

function required(value: string | undefined, label: string) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

export async function deliverDestination(
  destination: NotificationDestinationRow,
  message: Message
) {
  const values = config(destination);
  const text = `${message.subject}\n${message.body}`;
  switch (destination.channel as DestinationChannel) {
    case "SLACK":
      return post(required(values.url, "Webhook URL"), { text: `*${message.subject}*\n${message.body}` });
    case "DISCORD":
      return post(required(values.url, "Webhook URL"), { content: text });
    case "GOOGLE_CHAT":
      return post(required(values.url, "Webhook URL"), { text });
    case "MICROSOFT_TEAMS":
      return post(required(values.url, "Webhook URL"), {
        type: "message",
        attachments: [{
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              { type: "TextBlock", weight: "Bolder", text: message.subject },
              { type: "TextBlock", wrap: true, text: message.body },
            ],
          },
        }],
      });
    case "TELEGRAM":
      return post(
        `https://api.telegram.org/bot${required(values.botToken, "Bot token")}/sendMessage`,
        { chat_id: required(values.chatId, "Chat ID"), text }
      );
    case "PAGERDUTY":
      return post("https://events.pagerduty.com/v2/enqueue", {
        routing_key: required(values.routingKey, "Routing key"),
        event_action: message.eventType.includes("resolved") ? "resolve" : "trigger",
        dedup_key: values.dedupKey || undefined,
        payload: {
          summary: message.subject,
          source: "status",
          severity: values.severity || "warning",
          custom_details: { message: message.body, eventType: message.eventType },
        },
      });
    case "OPSGENIE": {
      const base = values.region === "eu" ? "https://api.eu.opsgenie.com" : "https://api.opsgenie.com";
      return post(
        `${base}/v2/alerts`,
        { message: message.subject, description: message.body, alias: values.alias || undefined },
        { Authorization: `GenieKey ${required(values.apiKey, "API key")}` }
      );
    }
    case "NTFY": {
      const server = (values.serverUrl || "https://ntfy.sh").replace(/\/+$/, "");
      return post(
        `${server}/${encodeURIComponent(required(values.topic, "Topic"))}`,
        message.body,
        {
          Title: message.subject,
          ...(values.token ? { Authorization: `Bearer ${values.token}` } : {}),
          "content-type": "text/plain",
        }
      );
    }
    case "WHATSAPP":
      return deliverTwilio(
        required(values.accountSid, "Account SID"),
        required(values.authToken, "Auth token"),
        `whatsapp:${required(values.from, "From number").replace(/^whatsapp:/, "")}`,
        `whatsapp:${required(values.to, "To number").replace(/^whatsapp:/, "")}`,
        text
      );
    default:
      throw new Error(`Unsupported destination channel ${destination.channel}`);
  }
}

export async function deliverSms(to: string, body: string, config?: SmsConfig) {
  const sms = config ?? (await getDeliveryConfig()).sms;
  if (!sms) throw new Error("SMS delivery is not configured");
  return deliverTwilio(sms.accountSid, sms.authToken, sms.fromNumber, to, body);
}

async function deliverTwilio(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
) {
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000)),
    }
  );
  if (!response.ok) throw new ProviderHttpError(`Messaging provider returned HTTP ${response.status}`, response.status);
  return response.status;
}

/** Confirms a Twilio account SID and auth token pair without sending a message. */
export async function verifyTwilioCredentials(accountSid: string, authToken: string) {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
    {
      headers: { authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
      signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000)),
    }
  );
  if (response.status === 401 || response.status === 404) throw new Error("Twilio rejected the account SID or auth token");
  if (!response.ok) throw new Error(`Twilio returned HTTP ${response.status}`);
}
