import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const database = vi.hoisted(() => {
  return {
    rows: [] as unknown[],
    user: {
      id: "064b0000-0000-4000-8000-000000000001",
      username: "admin",
      email: "admin@status.test",
      name: "SignalHub Admin",
    },
    membership: {
      id: "064b0000-0000-4000-8000-000000000002",
      orgId: "064b0000-0000-4000-8000-000000000003",
      role: "ADMIN",
      status: "ACTIVE",
    },
  };
});

const auth = vi.hoisted(() => ({ createSession: vi.fn() }));

vi.mock("@/lib/postgres/client", () => ({
  database: {
    selectFrom: () => {
      const builder = {
        selectAll: () => builder,
        select: () => builder,
        where: () => builder,
        executeTakeFirst: async () => database.rows.shift(),
      };
      return builder;
    },
  },
}));

vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/rate-limit", () => ({ requestIp: () => "127.0.0.1" }));

import { POST } from "@/app/api/auth/dev-login/route";

describe("development quick login database lifecycle", () => {
  beforeEach(() => {
    process.env.ENABLE_DEV_QUICK_LOGIN = "true";
    database.rows = [database.user, database.membership, { id: database.membership.orgId }];
    auth.createSession.mockReset();
  });

  it("queries PostgreSQL and creates a development session", async () => {
    const response = await POST(new NextRequest("http://localhost/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "tenant-admin" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, redirectTo: "/organization" });
    expect(database.rows).toEqual([]);
    expect(auth.createSession).toHaveBeenCalledOnce();
  });
});
