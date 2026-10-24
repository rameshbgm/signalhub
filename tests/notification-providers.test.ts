import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://signalhub:signalhub@127.0.0.1:5432/status_unit_tests";

// Only the network edge is replaced; request building and error handling run for real.
const guardedFetch = vi.fn<(url: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>>();
vi.mock("@/lib/guarded-fetch", () => ({ guardedFetch }));

const { deliverConfig, ProviderHttpError, ProviderRejectedError } = await import("../lib/notification-providers");

const message = { subject: "Checkout down", body: "We are investigating.", eventType: "incident.created", correlationId: "inc-1" };

function respond(status: number, body = "") {
  guardedFetch.mockResolvedValueOnce(new Response(status === 204 ? null : body, { status }));
}
function lastCall() {
  const [url, init] = guardedFetch.mock.calls.at(-1)!;
  return { url: String(url), init: init!, get json() { return JSON.parse(init!.body!); } };
}

beforeEach(() => guardedFetch.mockReset());

describe("provider requests", () => {
  it("posts Slack webhooks, Teams cards and Discord webhooks to the configured URL", async () => {
    respond(200, "ok");
    await deliverConfig("SLACK", { auth: "webhook", url: "https://hooks.slack.com/services/T/B/x" }, message);
    expect(lastCall().url).toBe("https://hooks.slack.com/services/T/B/x");
    expect(lastCall().json.text).toContain("Checkout down");

    respond(202);
    await deliverConfig("MICROSOFT_TEAMS", { url: "https://prod.westus.logic.azure.com/workflows/x" }, message);
    expect(lastCall().json.attachments[0].content.type).toBe("AdaptiveCard");

    respond(204);
    await deliverConfig("DISCORD", { auth: "webhook", url: "https://discord.com/api/webhooks/1/x" }, message);
    expect(lastCall().json.content).toContain("We are investigating.");
  });

  it("sends Telegram through the bot API with the chat id", async () => {
    respond(200);
    await deliverConfig("TELEGRAM", { botToken: "123:abc", chatId: "-100", messageThreadId: "7" }, message);
    expect(lastCall().url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(lastCall().json).toMatchObject({ chat_id: "-100", message_thread_id: 7 });
  });

  it("sends Twilio WhatsApp as basic-auth form data through the guarded fetch", async () => {
    respond(201);
    await deliverConfig("WHATSAPP", { accountSid: "AC1", authToken: "tok", from: "+1555", to: "+1666" }, message);
    const { url, init } = lastCall();
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect(init.headers!.authorization).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
    const form = new URLSearchParams(init.body);
    expect(form.get("From")).toBe("whatsapp:+1555");
    expect(form.get("To")).toBe("whatsapp:+1666");
  });

  it("routes PagerDuty by service region", async () => {
    respond(202);
    await deliverConfig("PAGERDUTY", { routingKey: "k" }, message);
    expect(lastCall().url).toBe("https://events.pagerduty.com/v2/enqueue");
    respond(202);
    await deliverConfig("PAGERDUTY", { routingKey: "k", region: "eu" }, message);
    expect(lastCall().url).toBe("https://events.eu.pagerduty.com/v2/enqueue");
  });

  it("tests PagerDuty by triggering and resolving the same alert", async () => {
    respond(202);
    respond(202);
    await deliverConfig("PAGERDUTY", { routingKey: "k" }, { ...message, eventType: "destination.test", correlationId: undefined });
    const [trigger, resolve] = guardedFetch.mock.calls.map(([, init]) => JSON.parse(init!.body!));
    expect(trigger.event_action).toBe("trigger");
    expect(resolve.event_action).toBe("resolve");
    expect(resolve.dedup_key).toBe(trigger.dedup_key);
  });

  it("names the missing field instead of calling the provider", async () => {
    await expect(deliverConfig("SLACK", { auth: "webhook" }, message)).rejects.toThrow("Webhook URL is required");
    expect(guardedFetch).not.toHaveBeenCalled();
  });
});

describe("provider failures", () => {
  it("keeps the provider's reason from a non-2xx response", async () => {
    respond(400, JSON.stringify({ ok: false, description: "Bad Request: chat not found" }));
    const error = await deliverConfig("TELEGRAM", { botToken: "1:a", chatId: "9" }, message).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect(error.status).toBe(400);
    expect(error.message).toContain("chat not found");
  });

  it("treats a Twilio error body as a final 4xx with its code", async () => {
    respond(400, JSON.stringify({ code: 21211, message: "Invalid 'To' Phone Number" }));
    const error = await deliverConfig("WHATSAPP", { accountSid: "AC1", authToken: "t", from: "+1", to: "+2" }, message).catch((e) => e);
    expect(error.status).toBe(400);
    expect(error.message).toContain("21211");
  });

  it("marks a Slack bot refusal final, but a rate limit retryable", async () => {
    const bot = { auth: "bot", botToken: "xoxb-1", channel: "C1" };
    respond(200, JSON.stringify({ ok: false, error: "channel_not_found" }));
    const final = await deliverConfig("SLACK", bot, message).catch((e) => e);
    expect(final).toBeInstanceOf(ProviderRejectedError);
    expect(final.transient).toBe(false);

    respond(200, JSON.stringify({ ok: false, error: "ratelimited" }));
    const limited = await deliverConfig("SLACK", bot, message).catch((e) => e);
    expect(limited.transient).toBe(true);
  });

  it("marks a chat webhook's HTTP 200 rejection final unless it is a rate limit", async () => {
    respond(200, JSON.stringify({ code: 19021, msg: "sign match fail" }));
    const final = await deliverConfig("LARK", { url: "https://open.larksuite.com/hook" }, message).catch((e) => e);
    expect(final.transient).toBe(false);

    respond(200, JSON.stringify({ code: 11232, msg: "frequency limited" }));
    const limited = await deliverConfig("LARK", { url: "https://open.larksuite.com/hook" }, message).catch((e) => e);
    expect(limited.transient).toBe(true);
  });
});
