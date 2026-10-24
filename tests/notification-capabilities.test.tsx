import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ global: true, page: true, pageExists: true, email: false, sms: false, worker: true }));
vi.mock("@/lib/postgres/client", () => ({
  database: {
    selectFrom(table: string) {
      const query = {
        select: () => query, where: () => query,
        executeTakeFirst: async () => table === "workerHeartbeats" ? (state.worker ? { id: "worker" } : undefined)
          : table === "platformConfiguration" ? { publicSubscriptionsEnabled: state.global }
            : state.pageExists ? { publicSubscriptionsEnabled: state.page } : undefined,
      };
      return query;
    },
  },
}));
vi.mock("@/lib/delivery-config", () => ({ getDeliveryConfig: async () => ({ smtp: state.email ? {} : null, sms: state.sms ? {} : null }) }));

import { subscriptionCapabilities } from "../lib/notification-capabilities";
import { SubscribeModal } from "../components/public/SubscribeModal";

describe("public notification availability", () => {
  beforeEach(() => { Object.assign(state, { global: true, page: true, pageExists: true, email: false, sms: false, worker: true }); });

  it("requires the global and page switches plus a configured subscriber provider", async () => {
    for (const global of [false, true]) for (const page of [false, true]) for (const email of [false, true]) for (const sms of [false, true]) {
      Object.assign(state, { global, page, email, sms });
      const capabilities = await subscriptionCapabilities("page");
      expect(capabilities.available).toBe(global && page && (email || sms));
      expect(capabilities.email.enabled).toBe(global && page && email);
      expect(capabilities.sms.enabled).toBe(global && page && sms);
      const html = renderToStaticMarkup(<SubscribeModal pageSlug="demo" brandColor="#0052cc" components={[]} initialCapabilities={capabilities} />);
      expect(html.includes("Subscribe to Updates")).toBe(capabilities.available);
    }
  });

  it("keeps the configured entry visible during a temporary worker outage, while blocking new verification codes", async () => {
    Object.assign(state, { email: true, worker: false });
    const capabilities = await subscriptionCapabilities("page");
    expect(capabilities.available).toBe(true);
    expect(capabilities.email.enabled).toBe(false);
    expect(capabilities.email.reason).toContain("worker");
  });

  it("does not offer subscriptions for a missing page", async () => {
    Object.assign(state, { email: true, pageExists: false });
    expect((await subscriptionCapabilities("missing")).available).toBe(false);
  });
});
