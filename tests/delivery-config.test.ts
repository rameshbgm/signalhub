import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ row: undefined as Record<string, unknown> | undefined, reads: 0 }));

vi.mock("@/lib/postgres/client", () => ({
  database: {
    selectFrom: () => {
      const builder = {
        selectAll: () => builder,
        where: () => builder,
        executeTakeFirst: async () => {
          store.reads += 1;
          return store.row;
        },
      };
      return builder;
    },
  },
}));
vi.mock("@/lib/logger", () => ({ log: () => undefined }));

import { clearDeliveryConfigCache, DEFAULT_SMTP_FROM, getDeliveryConfig } from "@/lib/delivery-config";
import { encryptSecret } from "@/lib/encryption";

const smtpRow = {
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUsername: "mailer",
  smtpFrom: "",
};

describe("delivery provider configuration", () => {
  beforeEach(() => {
    clearDeliveryConfigCache();
    store.reads = 0;
  });

  it("decrypts stored secrets and defaults the sender", async () => {
    store.row = {
      ...smtpRow,
      smtpPasswordCiphertext: encryptSecret("smtp-pass"),
      smsProvider: "TWILIO",
      smsAccountId: "AC123",
      smsSecretCiphertext: encryptSecret("twilio-token"),
      smsFrom: "+15551234567",
    };
    const config = await getDeliveryConfig();
    expect(config.smtp).toEqual({
      host: "smtp.example.com", port: 465, secure: true, username: "mailer", password: "smtp-pass", from: DEFAULT_SMTP_FROM,
    });
    expect(config.sms).toEqual({ provider: "TWILIO", accountId: "AC123", secret: "twilio-token", fromNumber: "+15551234567" });
  });

  it("allows Telnyx without an account id", async () => {
    store.row = { smsProvider: "TELNYX", smsAccountId: null, smsSecretCiphertext: encryptSecret("key"), smsFrom: "+15551234567" };
    expect((await getDeliveryConfig()).sms).toEqual({ provider: "TELNYX", accountId: null, secret: "key", fromNumber: "+15551234567" });
  });

  it("treats an undecryptable secret as not configured instead of throwing", async () => {
    store.row = { ...smtpRow, smtpPasswordCiphertext: "v1.gone.a.b.c", smsProvider: "TWILIO", smsAccountId: "AC123", smsFrom: "+1555", smsSecretCiphertext: null };
    expect(await getDeliveryConfig()).toEqual({ smtp: null, sms: null });
  });

  it("caches reads so delivery does not query configuration per message", async () => {
    store.row = undefined;
    await getDeliveryConfig();
    await getDeliveryConfig();
    expect(store.reads).toBe(1);
    clearDeliveryConfigCache();
    await getDeliveryConfig();
    expect(store.reads).toBe(2);
  });
});
