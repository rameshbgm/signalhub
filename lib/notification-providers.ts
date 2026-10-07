import { createHmac, randomUUID } from "node:crypto";
import type { NotificationDestinationRow } from "@/lib/postgres/schema";
import { getDeliveryConfig, type SmsConfig } from "@/lib/delivery-config";
import { alertAction, defaultConfig, DESTINATION_PROVIDERS, PLATFORM_CONNECTION_KEY, type DestinationChannel } from "@/lib/destination-catalog";
import { decryptSecret } from "@/lib/encryption";
import { guardedFetch } from "@/lib/guarded-fetch";
import { destinationConnections } from "@/lib/platform-configuration";

export { DESTINATION_CHANNELS, type DestinationChannel } from "@/lib/destination-catalog";

type Message = {
  subject: string;
  body: string;
  eventType: string;
  /** Incident, maintenance or monitor id; on-call providers resolve alerts by it. */
  correlationId?: string;
};

/** A provider answered with a non-2xx status; callers decide whether to retry. */
export class ProviderHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function send(url: string, body: string, headers: Record<string, string>, method = "POST") {
  const response = await guardedFetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000)),
  });
  if (!response.ok) throw new ProviderHttpError(`Provider returned HTTP ${response.status}`, response.status);
  return response;
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return (await send(url, JSON.stringify(body), { "content-type": "application/json", ...headers })).status;
}

async function postForm(url: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return send(url, new URLSearchParams(fields).toString(), { "content-type": "application/x-www-form-urlencoded", ...headers });
}

/** Chat webhooks (Lark, DingTalk, WeCom) answer HTTP 200 even when they reject the message; the JSON code is the real result. */
async function postChecked(url: string, body: unknown, codeField: "code" | "errcode") {
  const response = await send(url, JSON.stringify(body), { "content-type": "application/json" });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (result[codeField] !== undefined && result[codeField] !== 0) {
    throw new Error(`Provider rejected the message: ${String(result.msg ?? result.errmsg ?? result[codeField])}`);
  }
  return response.status;
}

/** DingTalk robot signature: HMAC-SHA256 of "timestamp\nsecret", keyed by the secret, in the query string. */
export function dingTalkSignedUrl(url: string, secret: string, now = Date.now()) {
  const sign = createHmac("sha256", secret).update(`${now}\n${secret}`).digest("base64");
  const signed = new URL(url);
  signed.searchParams.set("timestamp", String(now));
  signed.searchParams.set("sign", sign);
  return signed.toString();
}

/** Lark bot signature: HMAC-SHA256 of an empty message, keyed by "timestamp\nsecret". */
export function larkSignature(secret: string, seconds = Math.floor(Date.now() / 1_000)) {
  return { timestamp: String(seconds), sign: createHmac("sha256", `${seconds}\n${secret}`).update("").digest("base64") };
}

const basicAuth = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const trimSlash = (url: string) => url.replace(/\/+$/, "");

async function config(destination: NotificationDestinationRow) {
  const channel = destination.channel as DestinationChannel;
  const parsed: unknown = JSON.parse(decryptSecret(destination.configCiphertext));
  if (!parsed || typeof parsed !== "object") throw new Error("Destination configuration is invalid");
  // Resolved at send time, so a platform credential rotation reaches every organization at once.
  if ((parsed as Record<string, string>)[PLATFORM_CONNECTION_KEY] === "true") {
    const shared = (await destinationConnections())[channel];
    if (!shared) throw new Error(`The platform connection for ${DESTINATION_PROVIDERS[channel].label} was removed`);
    return { ...defaultConfig(channel), ...shared };
  }
  // Destinations saved before a field existed fall back to its default (e.g. Slack "auth" = webhook).
  return { ...defaultConfig(channel), ...(parsed as Record<string, string>) };
}

function required(value: string | undefined, label: string) {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

const ON_CALL = new Set<DestinationChannel>(["PAGERDUTY", "OPSGENIE", "SPLUNK_ON_CALL"]);
const SKIPPED = 204;

export async function deliverDestination(destination: NotificationDestinationRow, message: Message) {
  const channel = destination.channel as DestinationChannel;
  return deliverConfig(channel, await config(destination), message);
}

/** Sends to a provider with already-resolved settings; the platform's "Test connection" uses it directly. */
export async function deliverConfig(channel: DestinationChannel, values: Record<string, string>, message: Message) {
  // A connection test on an on-call provider opens an alert and closes it again, leaving nothing behind.
  if (message.eventType === "destination.test" && ON_CALL.has(channel)) {
    const correlationId = `signalhub-test-${randomUUID()}`;
    await deliverToProvider(channel, values, { ...message, eventType: "incident.created", correlationId });
    return deliverToProvider(channel, values, { ...message, eventType: "incident.resolved", correlationId });
  }
  return deliverToProvider(channel, values, message);
}

async function deliverToProvider(channel: DestinationChannel, values: Record<string, string>, message: Message) {
  const text = `${message.subject}\n${message.body}`;
  const action = alertAction(message.eventType);
  switch (channel) {
    case "SLACK": {
      const slackText = `*${message.subject}*\n${message.body}`;
      if (values.auth !== "bot") return post(required(values.url, "Webhook URL"), { text: slackText });
      // chat.postMessage answers 200 even on failure; the JSON "ok" flag is the real result.
      const response = await send("https://slack.com/api/chat.postMessage", JSON.stringify({ channel: required(values.channel, "Channel ID"), text: slackText }), {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${required(values.botToken, "Bot token")}`,
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!result.ok) throw new Error(`Slack rejected the message: ${result.error ?? "unknown error"}`);
      return response.status;
    }
    case "DISCORD":
      if (values.auth === "bot") {
        return post(
          `https://discord.com/api/v10/channels/${encodeURIComponent(required(values.channelId, "Channel ID"))}/messages`,
          { content: text },
          { authorization: `Bot ${required(values.botToken, "Bot token")}` }
        );
      }
      return post(required(values.url, "Webhook URL"), { content: text, ...(values.username ? { username: values.username } : {}) });
    case "GOOGLE_CHAT":
    case "ROCKET_CHAT":
      return post(required(values.url, "Webhook URL"), { text });
    case "MATTERMOST":
      if (values.auth === "token") {
        return post(
          `${trimSlash(required(values.serverUrl, "Server URL"))}/api/v4/posts`,
          { channel_id: required(values.channelId, "Channel ID"), message: `**${message.subject}**\n${message.body}` },
          { authorization: `Bearer ${required(values.token, "Bot access token")}` }
        );
      }
      return post(required(values.url, "Webhook URL"), { text: `**${message.subject}**\n${message.body}` });
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
    case "WEBEX":
      return post(
        "https://webexapis.com/v1/messages",
        { roomId: required(values.roomId, "Space ID"), markdown: `**${message.subject}**\n\n${message.body}` },
        { authorization: `Bearer ${required(values.botToken, "Bot token")}` }
      );
    case "ZULIP":
      return (await postForm(
        `${trimSlash(required(values.siteUrl, "Zulip URL"))}/api/v1/messages`,
        { type: "stream", to: required(values.stream, "Stream"), topic: values.topic || "Status updates", content: `**${message.subject}**\n${message.body}` },
        { authorization: basicAuth(required(values.botEmail, "Bot email"), required(values.apiKey, "API key")) }
      )).status;
    case "MATRIX":
      return (await send(
        `${trimSlash(required(values.homeserverUrl, "Homeserver URL"))}/_matrix/client/v3/rooms/${encodeURIComponent(required(values.roomId, "Room ID"))}/send/m.room.message/${randomUUID()}`,
        JSON.stringify({ msgtype: "m.text", body: text }),
        { "content-type": "application/json", authorization: `Bearer ${required(values.accessToken, "Access token")}` },
        "PUT"
      )).status;
    case "LARK":
      return postChecked(required(values.url, "Webhook URL"), {
        ...(values.secret ? larkSignature(values.secret) : {}),
        msg_type: "text",
        content: { text },
      }, "code");
    case "DINGTALK": {
      const url = required(values.url, "Webhook URL");
      return postChecked(values.secret ? dingTalkSignedUrl(url, values.secret) : url, { msgtype: "text", text: { content: text } }, "errcode");
    }
    case "WECOM":
      return postChecked(required(values.url, "Webhook URL"), { msgtype: "text", text: { content: text } }, "errcode");
    case "SIGNAL":
      return post(`${trimSlash(required(values.serverUrl, "Server URL"))}/v2/send`, {
        message: text,
        number: required(values.number, "Sender number"),
        recipients: required(values.recipients, "Recipients").split(",").map((recipient) => recipient.trim()).filter(Boolean),
      });
    case "TELEGRAM":
      return post(`https://api.telegram.org/bot${required(values.botToken, "Bot token")}/sendMessage`, {
        chat_id: required(values.chatId, "Chat ID"),
        text,
        ...(values.messageThreadId ? { message_thread_id: Number(values.messageThreadId) } : {}),
      });
    case "WHATSAPP":
      return deliverTwilio(
        required(values.accountSid, "Account SID"),
        required(values.authToken, "Auth token"),
        `whatsapp:${required(values.from, "From number").replace(/^whatsapp:/, "")}`,
        `whatsapp:${required(values.to, "To number").replace(/^whatsapp:/, "")}`,
        text
      );
    case "PAGERDUTY": {
      const dedupKey = message.correlationId ?? values.dedupKey;
      // Without a key there is no open alert to resolve.
      if (!action || (action === "resolve" && !dedupKey)) return SKIPPED;
      return post("https://events.pagerduty.com/v2/enqueue", {
        routing_key: required(values.routingKey, "Routing key"),
        event_action: action,
        dedup_key: dedupKey,
        payload: {
          summary: message.subject,
          source: "signalhub",
          severity: values.severity || "warning",
          custom_details: { message: message.body, eventType: message.eventType },
        },
      });
    }
    case "OPSGENIE": {
      if (!action) return SKIPPED;
      const base = values.region === "eu" ? "https://api.eu.opsgenie.com" : "https://api.opsgenie.com";
      const headers = { authorization: `GenieKey ${required(values.apiKey, "API key")}` };
      const alias = message.correlationId;
      if (action === "resolve") {
        if (!alias) return SKIPPED;
        return post(`${base}/v2/alerts/${encodeURIComponent(alias)}/close?identifierType=alias`, { note: message.body }, headers);
      }
      return post(`${base}/v2/alerts`, {
        message: message.subject.slice(0, 130),
        description: message.body,
        priority: values.priority || "P3",
        ...(alias ? { alias } : {}),
      }, headers);
    }
    case "SPLUNK_ON_CALL":
      if (!action) return SKIPPED;
      return post(required(values.url, "REST endpoint URL"), {
        message_type: action === "resolve" ? "RECOVERY" : "CRITICAL",
        entity_id: message.correlationId ?? message.subject,
        entity_display_name: message.subject,
        state_message: message.body,
      });
    case "NTFY": {
      const server = trimSlash(values.serverUrl || "https://ntfy.sh");
      const auth: Record<string, string> = values.auth === "token"
        ? { authorization: `Bearer ${required(values.token, "Access token")}` }
        : values.auth === "basic"
          ? { authorization: basicAuth(required(values.username, "Username"), required(values.password, "Password")) }
          // Older destinations stored an optional token without an auth mode.
          : values.token ? { authorization: `Bearer ${values.token}` } : {};
      return (await send(`${server}/${encodeURIComponent(required(values.topic, "Topic"))}`, message.body, {
        "content-type": "text/plain",
        title: message.subject,
        priority: values.priority || "default",
        ...auth,
      })).status;
    }
    case "PUSHOVER": {
      const response = await postForm("https://api.pushover.net/1/messages.json", {
        token: required(values.appToken, "Application token"),
        user: required(values.userKey, "User key"),
        title: message.subject.slice(0, 250),
        message: message.body.slice(0, 1024),
        priority: { low: "-1", normal: "0", high: "1" }[values.priority as "low" | "normal" | "high"] ?? "0",
      });
      return response.status;
    }
    case "PUSHBULLET":
      return post("https://api.pushbullet.com/v2/pushes", {
        type: "note",
        title: message.subject,
        body: message.body,
        ...(values.channelTag ? { channel_tag: values.channelTag } : {}),
      }, { "access-token": required(values.accessToken, "Access token") });
    case "GOTIFY":
      return post(
        `${trimSlash(required(values.serverUrl, "Server URL"))}/message`,
        { title: message.subject, message: message.body, priority: { low: 2, normal: 5, high: 8 }[values.priority as "low" | "normal" | "high"] ?? 5 },
        { "x-gotify-key": required(values.appToken, "Application token") }
      );
    case "HTTP": {
      const auth: Record<string, string> =
        values.auth === "bearer" ? { authorization: `Bearer ${required(values.token, "Bearer token")}` }
          : values.auth === "basic" ? { authorization: basicAuth(required(values.username, "Username"), required(values.password, "Password")) }
            : values.auth === "header" ? { [required(values.headerName, "Header name").toLowerCase()]: required(values.headerValue, "Header value") }
              : {};
      return post(required(values.url, "Endpoint URL"), {
        type: message.eventType,
        subject: message.subject,
        body: message.body,
        correlationId: message.correlationId ?? null,
        sentAt: new Date().toISOString(),
      }, auth);
    }
    default:
      throw new Error(`Unsupported destination channel ${channel satisfies never}`);
  }
}

export async function deliverSms(to: string, body: string, config?: SmsConfig) {
  const sms = config ?? (await getDeliveryConfig()).sms;
  if (!sms) throw new Error("SMS delivery is not configured");
  const accountId = () => required(sms.accountId ?? undefined, "Account ID");
  switch (sms.provider) {
    case "TWILIO":
      return deliverTwilio(accountId(), sms.secret, sms.fromNumber, to, body);
    case "VONAGE": {
      // Vonage answers 200 even when a message is rejected; the per-message status is the result.
      const response = await postForm("https://rest.nexmo.com/sms/json", {
        api_key: accountId(), api_secret: sms.secret, from: sms.fromNumber.replace(/^\+/, ""), to: to.replace(/^\+/, ""), text: body,
      });
      const result = await response.json().catch(() => ({})) as { messages?: Array<{ status?: string; "error-text"?: string }> };
      const first = result.messages?.[0];
      if (first?.status !== "0") throw new Error(`Vonage rejected the message: ${first?.["error-text"] ?? "unknown error"}`);
      return response.status;
    }
    case "PLIVO":
      return post(
        `https://api.plivo.com/v1/Account/${encodeURIComponent(accountId())}/Message/`,
        { src: sms.fromNumber, dst: to, text: body },
        { authorization: basicAuth(accountId(), sms.secret) }
      );
    case "TELNYX":
      return post("https://api.telnyx.com/v2/messages", { from: sms.fromNumber, to, text: body }, { authorization: `Bearer ${sms.secret}` });
    case "SINCH":
      return post(
        `https://us.sms.api.sinch.com/xms/v1/${encodeURIComponent(accountId())}/batches`,
        { from: sms.fromNumber, to: [to], body },
        { authorization: `Bearer ${sms.secret}` }
      );
    case "CLICKSEND": {
      // ClickSend answers 200 per batch; each message carries its own status.
      const response = await send("https://rest.clicksend.com/v3/sms/send", JSON.stringify({ messages: [{ source: "signalhub", from: sms.fromNumber, to, body }] }), {
        "content-type": "application/json", authorization: basicAuth(accountId(), sms.secret),
      });
      const result = await response.json().catch(() => ({})) as { data?: { messages?: Array<{ status?: string }> } };
      const status = result.data?.messages?.[0]?.status;
      if (status !== "SUCCESS") throw new Error(`ClickSend rejected the message: ${status ?? "unknown error"}`);
      return response.status;
    }
    case "TEXTMAGIC":
      return post(
        "https://rest.textmagic.com/api/v2/messages",
        { text: body, phones: to.replace(/^\+/, ""), from: sms.fromNumber.replace(/^\+/, "") },
        { "x-tm-username": accountId(), "x-tm-key": sms.secret }
      );
    case "AFRICASTALKING": {
      const response = await postForm(
        "https://api.africastalking.com/version1/messaging",
        { username: accountId(), to, message: body, from: sms.fromNumber },
        { apikey: sms.secret, accept: "application/json" }
      );
      const result = await response.json().catch(() => ({})) as { SMSMessageData?: { Recipients?: Array<{ status?: string }> } };
      const status = result.SMSMessageData?.Recipients?.[0]?.status;
      if (status !== "Success") throw new Error(`Africa's Talking rejected the message: ${status ?? "unknown error"}`);
      return response.status;
    }
  }
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

/** Confirms SMS credentials with a read-only account call, without sending a message. */
export async function verifySmsCredentials(sms: Pick<SmsConfig, "provider" | "accountId" | "secret">) {
  const id = encodeURIComponent(sms.accountId ?? "");
  const request: { url: string; headers: Record<string, string> } = {
    TWILIO: { url: `https://api.twilio.com/2010-04-01/Accounts/${id}.json`, headers: { authorization: basicAuth(sms.accountId ?? "", sms.secret) } },
    VONAGE: { url: `https://rest.nexmo.com/account/get-balance?${new URLSearchParams({ api_key: sms.accountId ?? "", api_secret: sms.secret })}`, headers: {} },
    PLIVO: { url: `https://api.plivo.com/v1/Account/${id}/`, headers: { authorization: basicAuth(sms.accountId ?? "", sms.secret) } },
    TELNYX: { url: "https://api.telnyx.com/v2/balance", headers: { authorization: `Bearer ${sms.secret}` } },
    SINCH: { url: `https://us.sms.api.sinch.com/xms/v1/${id}/batches?page_size=1`, headers: { authorization: `Bearer ${sms.secret}` } },
    CLICKSEND: { url: "https://rest.clicksend.com/v3/account", headers: { authorization: basicAuth(sms.accountId ?? "", sms.secret) } },
    TEXTMAGIC: { url: "https://rest.textmagic.com/api/v2/user", headers: { "x-tm-username": sms.accountId ?? "", "x-tm-key": sms.secret } },
    AFRICASTALKING: { url: `https://api.africastalking.com/version1/user?${new URLSearchParams({ username: sms.accountId ?? "" })}`, headers: { apikey: sms.secret, accept: "application/json" } },
  }[sms.provider];
  const response = await guardedFetch(request.url, {
    headers: request.headers,
    signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS ?? 10_000)),
  });
  if ([401, 403, 404].includes(response.status)) throw new Error("The SMS provider rejected these credentials");
  if (!response.ok) throw new Error(`The SMS provider returned HTTP ${response.status}`);
}
