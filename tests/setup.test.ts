import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { postgresPoolOptions } from "@/lib/postgres/pool-options";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { environmentKeys, mergeIntoEnv, readRuntimeConfig, removeRuntimeConfigKeys, writeRuntimeConfig } from "@/lib/setup/config-file";
import { databaseUrlFromInput, describeConnectionError, looksLikeTransactionPooler } from "@/lib/setup/database-check";
import { guardSetupRequest } from "@/lib/setup/http";

vi.mock("@/lib/postgres/client", () => ({ database: {} }));
const { adminInputErrors, slugFromName } = await import("@/lib/setup/admin");

describe("database pool options", () => {
  it("pins a pasted CA and drops sslmode so pg cannot override it", () => {
    const options = postgresPoolOptions({
      DATABASE_URL: "postgresql://u:p@db.example:5432/app?sslmode=require&application_name=x",
      DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
    });
    expect(options.ssl).toEqual({ ca: expect.stringContaining("BEGIN CERTIFICATE"), rejectUnauthorized: true });
    expect(options.connectionString).not.toContain("sslmode");
    expect(options.connectionString).toContain("application_name=x");
  });

  it("leaves the URL alone without a CA", () => {
    const url = "postgresql://u:p@db.example/app?sslmode=verify-full";
    expect(postgresPoolOptions({ DATABASE_URL: url }).connectionString).toBe(url);
    expect(() => postgresPoolOptions({ DATABASE_URL: "mysql://x" })).toThrow("PostgreSQL connection string");
  });
});

describe("runtime config precedence", () => {
  it("lets environment variables win over the config file", () => {
    const merged = mergeIntoEnv({ DATABASE_URL: "postgresql://env" }, { DATABASE_URL: "postgresql://file", SESSION_SECRET: "s" });
    expect(merged.DATABASE_URL).toBe("postgresql://env");
    expect(merged.SESSION_SECRET).toBe("s");
  });

  it("drops empty values so Compose's ${VAR:-} never masks a setting", () => {
    const merged = mergeIntoEnv({ NEXT_PUBLIC_APP_URL: "", DATABASE_URL: "" }, { DATABASE_URL: "postgresql://file" });
    expect("NEXT_PUBLIC_APP_URL" in merged).toBe(false);
    expect(merged.DATABASE_URL).toBe("postgresql://file");
  });
});

describe("database connection input", () => {
  it("encodes special characters in credentials", () => {
    const url = databaseUrlFromInput({
      host: "db.example", port: 5433, database: "status", user: "app", password: "p@ss:w/rd#1", sslMode: "verify-full",
    });
    expect(new URL(url).password).toBe(encodeURIComponent("p@ss:w/rd#1"));
    expect(url).toContain(":5433/status?sslmode=verify-full");
  });

  it("explains common failures in plain language", () => {
    expect(describeConnectionError({ code: "28P01" })).toMatch(/password/);
    expect(describeConnectionError({ code: "3D000" })).toMatch(/does not exist/);
    expect(describeConnectionError(Object.assign(new Error("x"), { code: "SELF_SIGNED_CERT_IN_CHAIN" }))).toMatch(/CA certificate/);
  });

  it("flags transaction poolers", () => {
    expect(looksLikeTransactionPooler("postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres")).toBe(true);
    expect(looksLikeTransactionPooler("postgresql://u:p@db.example:5432/app")).toBe(false);
  });
});

describe("setup access", () => {
  it("allows a same-origin request during the matching setup step with the operator token", () => {
    const previousMode = process.env.SIGNALHUB_SETUP_MODE;
    const previousToken = process.env.SIGNALHUB_SETUP_TOKEN;
    process.env.SIGNALHUB_SETUP_TOKEN = "a".repeat(43);
    process.env.SIGNALHUB_SETUP_MODE = "db";
    try {
      const request = new NextRequest("http://localhost/api/setup/database", {
        method: "POST",
        headers: { host: "localhost", origin: "http://localhost", authorization: `Bearer ${"a".repeat(43)}` },
      });
      expect(guardSetupRequest(request, "db")).toBeNull();
    } finally {
      if (previousToken === undefined) delete process.env.SIGNALHUB_SETUP_TOKEN;
      else process.env.SIGNALHUB_SETUP_TOKEN = previousToken;
      if (previousMode === undefined) delete process.env.SIGNALHUB_SETUP_MODE;
      else process.env.SIGNALHUB_SETUP_MODE = previousMode;
    }
  });
});

describe("first admin validation", () => {
  const valid = {
    username: "admin", password: "a-very-long-unique-passphrase", name: "Ada Lovelace",
    email: "ada@example.com", organizationName: "Acme", organizationSlug: "acme",
  };

  it("enforces the password policy and email in the wizard", () => {
    expect(adminInputErrors(valid, { strict: true })).toEqual({});
    expect(adminInputErrors({ ...valid, password: "short" }, { strict: true }).password).toMatch(/at least/);
    expect(adminInputErrors({ ...valid, password: "lovelace-short-x" }, { strict: true }).password).toMatch(/name/);
    expect(adminInputErrors({ ...valid, email: "nope" }, { strict: true }).email).toBeDefined();
    expect(adminInputErrors({ ...valid, organizationSlug: "Bad Slug" }, { strict: true }).organizationSlug).toBeDefined();
  });

  it("derives a slug from the organization name", () => {
    expect(slugFromName("Acme Status — EU!")).toBe("acme-status-eu");
  });
});

describe("setup state on disk", () => {
  const env = () => ({ SIGNALHUB_DATA_DIR: mkdtempSync(path.join(tmpdir(), "signalhub-setup-")) }) as unknown as NodeJS.ProcessEnv;

  it("forgets only the database when setup restarts", async () => {
    const data = env();
    await writeRuntimeConfig({ DATABASE_URL: "postgresql://a", DATABASE_SSL_CA: "pem", SESSION_SECRET: "s", ENCRYPTION_KEY: "k" }, data);
    await removeRuntimeConfigKeys(["DATABASE_URL", "DATABASE_SSL_CA"], data);
    expect(await readRuntimeConfig(data)).toEqual({ SESSION_SECRET: "s", ENCRYPTION_KEY: "k" });
  });

  it("records which settings came from the real environment", () => {
    expect(environmentKeys({ DATABASE_URL: "postgresql://x", NEXT_PUBLIC_APP_URL: "" })).toEqual(["DATABASE_URL"]);
    expect(environmentKeys({ DATABASE_URL: "postgresql://merged", SIGNALHUB_ENV_KEYS: "" })).toEqual([]);
  });

});

