import { NextRequest } from "next/server";
import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IdentityConnectionRow } from "@/lib/postgres/schema";

const url = process.env.INTEGRATION_DATABASE_URL;
const enabled = Boolean(url && /test/i.test(new URL(url).pathname));
if (url && !enabled) throw new Error("Identity security tests require a disposable database named test");
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("identity security boundaries", () => {
  let db: typeof import("@/lib/postgres/client");
  let scim: typeof import("@/lib/scim");
  let sso: typeof import("@/lib/identity-connections");
  let connection: IdentityConnectionRow;
  let victim: { id: string; username: string; email: string };
  const suffix = randomUUID().slice(0, 8);
  beforeAll(async () => {
    db = await import("@/lib/postgres/client");
    await (await import("@/lib/migrations")).runMigrations();
    scim = await import("@/lib/scim");
    sso = await import("@/lib/identity-connections");
    const { bootstrapInstance } = await import("@/lib/setup/admin");
    for (const org of ["source", "victim"]) {
      await bootstrapInstance({ username: `${org}-${suffix}`, name: "Test Owner", email: `${org}-${suffix}@example.test`,
        password: "test-only-bootstrap-passphrase-123", organizationName: org, organizationSlug: `${org}-${suffix}`,
      }, { onlyIfNoUsers: false, mustChangePassword: false });
    }
    victim = await db.database.selectFrom("users").select(["id", "username", "email"]).where("username", "=", `victim-${suffix}`).executeTakeFirstOrThrow();
    const source = await db.database.selectFrom("organizations").select("id").where("slug", "=", `source-${suffix}`).executeTakeFirstOrThrow();
    const owner = await db.database.selectFrom("users").select("id").where("username", "=", `source-${suffix}`).executeTakeFirstOrThrow();
    connection = await db.database.insertInto("identityConnections").values({
      name: "Test IdP", slug: `test-idp-${suffix}`, type: "OIDC", audience: "ORGANIZATION", orgId: source.id,
      configCiphertext: "not-used-by-these-tests", defaultRole: null, createdBy: owner.id,
      roleMappings: sql`${JSON.stringify([{ group: "admins", role: "ADMIN", pageIds: [] }])}::jsonb`, allowJitProvisioning: false,
      lastTestedAt: null, lastTestOk: null, lastError: null,
    }).returningAll().executeTakeFirstOrThrow();
  }, 60_000);
  afterAll(async () => { await db?.closeDatabase(); });

  async function provision() {
    const name = `scim-${randomUUID().slice(0, 8)}`;
    return scim.provisionScimUser({ connection, externalId: name, userName: name, email: `${name}@example.test`, active: true });
  }
  const login = (subject: string, groups: string[]) => sso.upsertExternalUser({ connection, subject, email: "sso@example.test", name: "SSO User", groups });

  it("rejects global username collisions without changing the victim or adding an identity", async () => {
    await expect(scim.provisionScimUser({ connection, externalId: "attacker", userName: victim.username, email: "attacker@example.test", active: true }))
      .rejects.toBeInstanceOf(scim.ScimIdentityConflictError);
    expect(await db.database.selectFrom("users").select("email").where("id", "=", victim.id).executeTakeFirstOrThrow()).toEqual({ email: victim.email });
    expect(await db.database.selectFrom("externalIdentities").select("id").where("connectionId", "=", connection.id).where("subject", "=", "attacker").executeTakeFirst()).toBeUndefined();
  });
  it("keeps identity ownership on rename and rejects a rename to an existing account", async () => {
    const initial = await provision();
    await expect(scim.provisionScimUser({ connection, externalId: initial.identity.subject, userName: victim.username, email: "changed@example.test" }))
      .rejects.toBeInstanceOf(scim.ScimIdentityConflictError);
    const renamed = await scim.provisionScimUser({ connection, externalId: initial.identity.subject, userName: `${initial.user.username}-new`, email: "changed@example.test" });
    expect(renamed.user.id).toBe(initial.user.id);
    expect(renamed.identity.id).toBe(initial.identity.id);
    expect(renamed.user.username).toBe(`${initial.user.username}-new`);
    expect(renamed.user.email).toBe("changed@example.test");
  });
  it("does not reactivate a revoked membership on SSO login, profile updates or group sync", async () => {
    const initial = await provision();
    expect((await login(initial.identity.subject, ["admins"]))?.membership.role).toBe("ADMIN");
    await db.database.updateTable("memberships").set({ status: "REVOKED" }).where("userId", "=", initial.user.id).execute();
    expect(await login(initial.identity.subject, ["admins"])).toBeNull();
    const edited = await scim.provisionScimUser({ connection, externalId: initial.identity.subject, userName: initial.user.username, email: initial.user.email });
    expect(edited.active).toBe(false);
    await db.database.insertInto("scimGroups").values({ connectionId: connection.id, externalId: null, displayName: "admins", memberExternalIds: [initial.identity.id] }).execute();
    await scim.synchronizeScimGroupMemberships(connection);
    expect((await db.database.selectFrom("memberships").select("status").where("userId", "=", initial.user.id).executeTakeFirstOrThrow()).status).toBe("REVOKED");
    const restored = await scim.provisionScimUser({ connection, externalId: initial.identity.subject, userName: initial.user.username, email: initial.user.email, active: true });
    expect(restored.active).toBe(true);
    expect(await login(initial.identity.subject, ["admins"])).not.toBeNull();
  });
  it("revokes old Admin membership and all its sessions when the last entitlement disappears", async () => {
    const initial = await provision();
    const authorized = await login(initial.identity.subject, ["admins"]);
    expect(authorized?.membership.role).toBe("ADMIN");
    const session = await db.database.insertInto("authSessions").values({
      kind: "TENANT", userId: initial.user.id, membershipId: authorized!.membership.id, orgId: connection.orgId!,
      tokenHash: randomUUID(), authMethod: "OIDC", mfaVerified: true,
      idleExpiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: new Date(Date.now() + 60_000),
    } as never).returning("id").executeTakeFirstOrThrow();
    expect(await login(initial.identity.subject, [])).toBeNull();
    expect((await db.database.selectFrom("memberships").select("status").where("id", "=", authorized!.membership.id).executeTakeFirstOrThrow()).status).toBe("REVOKED");
    expect((await db.database.selectFrom("authSessions").select("revokedAt").where("id", "=", session.id).executeTakeFirstOrThrow()).revokedAt).not.toBeNull();
    expect(await login(initial.identity.subject, ["admins"])).toBeNull();
  });
  it("does not create unentitled JIT accounts", async () => {
    const subject = `new-${randomUUID()}`;
    expect(await sso.upsertExternalUser({ connection: { ...connection, allowJitProvisioning: true }, subject, email: "new@example.test", name: "New", groups: [] })).toBeNull();
    expect(await db.database.selectFrom("externalIdentities").select("id").where("subject", "=", subject).executeTakeFirst()).toBeUndefined();
  });
  it("permits entitled JIT provisioning and a subsequent valid login", async () => {
    const subject = `new-${randomUUID()}`;
    const input = { connection: { ...connection, allowJitProvisioning: true }, subject, email: `${subject}@example.test`, name: "New", groups: ["admins"] };
    const initial = await sso.upsertExternalUser(input);
    expect(initial?.membership.role).toBe("ADMIN");
    expect((await sso.upsertExternalUser(input))?.user.id).toBe(initial?.user.id);
  });
  it("binds a SAML transaction to the browser and connection and consumes it exactly once", async () => {
    const { createSamlTransaction, consumeSamlTransaction } = await import("@/lib/saml-transaction");
    const transaction = await createSamlTransaction(connection.slug, "/organization");
    await expect(consumeSamlTransaction(transaction.relayState, undefined, connection.slug)).rejects.toThrow();
    await expect(consumeSamlTransaction(transaction.relayState, "x".repeat(43), connection.slug)).rejects.toThrow();
    await expect(consumeSamlTransaction(transaction.relayState, transaction.nonce, "another-connection")).rejects.toThrow();
    await expect(consumeSamlTransaction(`${transaction.relayState}tampered`, transaction.nonce, connection.slug)).rejects.toThrow();
    const attempts = await Promise.allSettled([
      consumeSamlTransaction(transaction.relayState, transaction.nonce, connection.slug),
      consumeSamlTransaction(transaction.relayState, transaction.nonce, connection.slug),
    ]);
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("rejects expired SAML browser state and prevents mixing request IDs", async () => {
    const { createSamlTransaction, consumeSamlTransaction } = await import("@/lib/saml-transaction");
    const { PostgresSamlCache } = await import("@/lib/saml");
    const transaction = await createSamlTransaction(connection.slug, "/organization");
    await db.database.updateTable("samlRequests").set({ expiresAt: new Date(Date.now() - 1000) })
      .where("id", "=", `browser:${transaction.requestId}`).execute();
    await expect(consumeSamlTransaction(transaction.relayState, transaction.nonce, connection.slug)).rejects.toThrow();
    const otherId = `_${randomUUID()}`;
    const cache = new PostgresSamlCache(transaction.requestId);
    await cache.saveAsync(otherId, "synthetic-request");
    expect(await cache.getAsync(otherId)).toBeNull();
    expect(await cache.removeAsync(otherId)).toBeNull();
    expect(await new PostgresSamlCache(otherId).getAsync(otherId)).toBe("synthetic-request");
    await cache.saveAsync(transaction.requestId, "expected-request");
    expect(await cache.getAsync(transaction.requestId)).toBe("expected-request");
  });

  async function credential(overrides: { revokedAt?: Date; expiresAt?: Date } = {}) {
    const token = `test-${randomUUID()}`;
    const { hashSecret } = await import("@/lib/secrets");
    await db.database.insertInto("scimTokens").values({
      connectionId: connection.id, tokenHash: hashSecret(token), prefix: "test", lastFour: token.slice(-4),
      createdBy: connection.createdBy, lastUsedAt: null, expiresAt: null, revokedAt: null, ...overrides,
    }).execute();
    return token;
  }
  function apiRequest(token: string, method = "GET", body?: unknown, query = "") {
    return new NextRequest(`https://status.example/api/scim/v2/${connection.slug}/Users${query}`, {
      method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const context = () => ({ params: Promise.resolve({ connection: connection.slug }) });

  it("rejects missing, wrong, expired, revoked and wrong-connection SCIM tokens", async () => {
    const routes = await import("@/app/api/scim/v2/[connection]/Users/route");
    for (const token of ["", "wrong", await credential({ expiresAt: new Date(Date.now() - 1000) }), await credential({ revokedAt: new Date() })]) {
      expect((await routes.GET(apiRequest(token), context())).status).toBe(401);
      expect((await routes.POST(apiRequest(token, "POST", {}), context())).status).toBe(401);
    }
    const token = await credential();
    expect((await routes.GET(apiRequest(token), { params: Promise.resolve({ connection: "other-connection" }) })).status).toBe(401);
    expect((await routes.GET(apiRequest(token), context())).status).toBe(200);
  });

  it("enforces SCIM ownership through create, read, rename and delete routes", async () => {
    const collection = await import("@/app/api/scim/v2/[connection]/Users/route");
    const routes = await import("@/app/api/scim/v2/[connection]/Users/[id]/route");
    const token = await credential();
    const userName = `route-${randomUUID().slice(0, 8)}`;
    const created = await collection.POST(apiRequest(token, "POST", { userName, emails: [{ value: `${userName}@example.test` }] }), context());
    expect(created.status).toBe(201);
    const resource = await created.json();
    const ctx = { params: Promise.resolve({ connection: connection.slug, id: resource.id }) };
    expect((await routes.GET(apiRequest(token), ctx)).status).toBe(200);
    const conflict = await routes.PATCH(apiRequest(token, "PATCH", { userName: victim.username }), ctx);
    expect(conflict.status).toBe(409);
    const renamed = await routes.PATCH(apiRequest(token, "PATCH", { userName: `${userName}-new` }), ctx);
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).id).toBe(resource.id);
    // A valid identity ID belonging to another connection must not become accessible.
    const foreign = await db.database.insertInto("externalIdentities").values({
      connectionId: connection.id, userId: victim.id, subject: `foreign-${randomUUID()}`, canonicalEmail: victim.email,
      groups: [], version: 1, lastLoginAt: null,
    }).returningAll().executeTakeFirstOrThrow();
    const other = await db.database.insertInto("identityConnections").values({
      name: "Other", slug: `other-${randomUUID()}`, type: "OIDC", audience: "ORGANIZATION", orgId: connection.orgId,
      configCiphertext: "unused", createdBy: connection.createdBy, roleMappings: sql`'[]'::jsonb`,
      lastTestedAt: null, lastTestOk: null, lastError: null,
    }).returning("id").executeTakeFirstOrThrow();
    await db.database.updateTable("externalIdentities").set({ connectionId: other.id }).where("id", "=", foreign.id).execute();
    const foreignContext = { params: Promise.resolve({ connection: connection.slug, id: foreign.id }) };
    expect((await routes.GET(apiRequest(token), foreignContext)).status).toBe(404);
    expect((await routes.PATCH(apiRequest(token, "PATCH", { displayName: "attacker" }), foreignContext)).status).toBe(404);
    expect((await routes.DELETE(apiRequest(token, "DELETE"), foreignContext)).status).toBe(404);
    expect((await db.database.selectFrom("users").select("email").where("id", "=", victim.id).executeTakeFirstOrThrow()).email).toBe(victim.email);
    const patched = await routes.PATCH(apiRequest(token, "PATCH", { Operations: [{ op: "replace", path: "displayName", value: "Valid rename" }] }), ctx);
    expect(patched.status).toBe(200);
    expect((await patched.json()).displayName).toBe("Valid rename");
    expect((await routes.DELETE(apiRequest(token, "DELETE"), ctx)).status).toBe(204);
    expect((await (await routes.GET(apiRequest(token), ctx)).json()).active).toBe(false);
  });

  it.each([null, [], { active: "true" }, { userName: 42 }, { displayName: {} }, { Operations: {} }, { Operations: [null] }, { Operations: [{ path: 42 }] }, { Operations: [{ path: "active", value: "true" }] }, { Operations: [{ path: "userName", value: "x" }] }])(
    "rejects malformed SCIM updates without server errors or mutation: %j", async (body) => {
      const initial = await provision();
      const token = await credential();
      const { PATCH } = await import("@/app/api/scim/v2/[connection]/Users/[id]/route");
      const response = await PATCH(apiRequest(token, "PATCH", body), { params: Promise.resolve({ connection: connection.slug, id: initial.identity.id }) });
      expect(response.status).toBe(400);
      expect((await db.database.selectFrom("externalIdentities").select("version").where("id", "=", initial.identity.id).executeTakeFirstOrThrow()).version).toBe(initial.identity.version);
    },
  );

  it.each(["NaN", "Infinity", "1.5", "9007199254740993", "abc"])("rejects invalid SCIM pagination: %s", async (value) => {
    const token = await credential();
    for (const routes of [await import("@/app/api/scim/v2/[connection]/Users/route"), await import("@/app/api/scim/v2/[connection]/Groups/route")]) {
      for (const key of ["count", "startIndex"]) {
        expect((await routes.GET(apiRequest(token, "GET", undefined, `?${key}=${value}`), context())).status).toBe(400);
      }
    }
  });

  it("preserves bounded pagination, including count-only queries", async () => {
    const token = await credential();
    const { GET } = await import("@/app/api/scim/v2/[connection]/Users/route");
    const countOnly = await GET(apiRequest(token, "GET", undefined, "?count=0"), context());
    expect(countOnly.status).toBe(200);
    const body = await countOnly.json();
    expect(body.Resources).toEqual([]);
    expect(body.totalResults).toBeGreaterThan(0);
    const bounded = await GET(apiRequest(token, "GET", undefined, "?count=999&startIndex=-1"), context());
    expect(bounded.status).toBe(200);
    const page = await bounded.json();
    expect(page.startIndex).toBe(1);
    expect(page.itemsPerPage).toBeLessThanOrEqual(200);
  });

  it.each(["delete", "active=false"])("permanently revokes cross-organization Admin sessions on SCIM %s", async (method) => {
    const initial = await provision();
    const authorized = await login(initial.identity.subject, ["admins"]);
    const otherOrg = await db.database.selectFrom("memberships").select("orgId").where("userId", "=", victim.id).executeTakeFirstOrThrow();
    await db.database.insertInto("memberships").values({
      orgId: otherOrg.orgId, userId: initial.user.id, role: "VIEWER", status: "ACTIVE", pageIds: null,
      activatedAt: new Date(), invitationExpiresAt: null, invitationTokenHash: null,
    }).execute();
    const session = await db.database.insertInto("authSessions").values({
      kind: "TENANT", userId: initial.user.id, membershipId: authorized!.membership.id, orgId: otherOrg.orgId,
      tokenHash: randomUUID(), authMethod: "OIDC", mfaVerified: true,
      idleExpiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: new Date(Date.now() + 60_000),
    } as never).returning("id").executeTakeFirstOrThrow();
    if (method === "delete") expect(await scim.deprovisionScimUser(connection, initial.identity.id)).toBe(true);
    else await scim.provisionScimUser({ connection, externalId: initial.identity.subject, userName: initial.user.username, email: initial.user.email, active: false });
    await scim.provisionScimUser({ connection, externalId: initial.identity.subject, userName: initial.user.username, email: initial.user.email, active: true });
    expect((await db.database.selectFrom("authSessions").select("revokedAt").where("id", "=", session.id).executeTakeFirstOrThrow()).revokedAt).not.toBeNull();
  });

  it("applies multi-operation group additions and removals and revokes both users' sessions", async () => {
    const routes = await import("@/app/api/scim/v2/[connection]/Groups/[id]/route");
    const users = [await provision(), await provision()];
    let group = await db.database.selectFrom("scimGroups").selectAll().where("connectionId", "=", connection.id).where("displayName", "=", "admins").executeTakeFirst();
    group ??= await db.database.insertInto("scimGroups").values({ connectionId: connection.id, externalId: null, displayName: "admins", memberExternalIds: [] }).returningAll().executeTakeFirstOrThrow();
    await db.database.updateTable("scimGroups").set({ memberExternalIds: [] }).where("id", "=", group.id).execute();
    const token = await credential();
    const ctx = { params: Promise.resolve({ connection: connection.slug, id: group.id }) };
    const operations = (op: string) => ({ Operations: users.map(user => ({ op, path: "members", value: [{ value: user.identity.id }] })) });
    expect((await routes.PATCH(apiRequest(token, "PATCH", operations("add")), ctx)).status).toBe(200);
    const added = await db.database.selectFrom("scimGroups").selectAll().where("id", "=", group.id).executeTakeFirstOrThrow();
    expect(added.memberExternalIds.sort()).toEqual(users.map(user => user.identity.id).sort());
    const sessionIds: string[] = [];
    for (const user of users) {
      const member = await db.database.selectFrom("memberships").selectAll().where("orgId", "=", connection.orgId!).where("userId", "=", user.user.id).executeTakeFirstOrThrow();
      expect(member.role).toBe("ADMIN");
      expect(member.status).toBe("ACTIVE");
      const session = await db.database.insertInto("authSessions").values({
        kind: "TENANT", userId: user.user.id, membershipId: member.id, orgId: connection.orgId!,
        tokenHash: randomUUID(), authMethod: "OIDC", mfaVerified: true,
        idleExpiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: new Date(Date.now() + 60_000),
      } as never).returning("id").executeTakeFirstOrThrow();
      sessionIds.push(session.id);
    }
    const stale = apiRequest(token, "PATCH", operations("remove"));
    stale.headers.set("if-match", `W/"${group.version}"`);
    expect((await routes.PATCH(stale, ctx)).status).toBe(412);
    expect((await routes.PATCH(apiRequest(token, "PATCH", operations("remove")), ctx)).status).toBe(200);
    expect((await db.database.selectFrom("scimGroups").select("memberExternalIds").where("id", "=", group.id).executeTakeFirstOrThrow()).memberExternalIds).toEqual([]);
    for (const user of users) {
      expect((await db.database.selectFrom("memberships").select("status").where("orgId", "=", connection.orgId!).where("userId", "=", user.user.id).executeTakeFirstOrThrow()).status).toBe("REVOKED");
      expect(await login(user.identity.subject, ["admins"])).toBeNull();
    }
    const sessions = await db.database.selectFrom("authSessions").select("revokedAt").where("id", "in", sessionIds).execute();
    expect(sessions.every(session => session.revokedAt !== null)).toBe(true);
  });

  it("rejects malformed group PATCH and PUT requests without partial changes", async () => {
    const routes = await import("@/app/api/scim/v2/[connection]/Groups/[id]/route");
    const initial = await provision();
    const group = await db.database.insertInto("scimGroups").values({ connectionId: connection.id, externalId: null, displayName: `invalid-${randomUUID()}`, memberExternalIds: [initial.identity.id] }).returningAll().executeTakeFirstOrThrow();
    const token = await credential();
    const ctx = { params: Promise.resolve({ connection: connection.slug, id: group.id }) };
    for (const handler of [routes.PATCH, routes.PUT]) {
      for (const body of [null, { members: {} }, { Operations: [null] }, { Operations: [
        { op: "replace", path: "displayName", value: "must-not-save" },
        { op: "add", path: "members", value: [{ value: "invalid-id" }] },
      ] }]) {
        expect((await handler(apiRequest(token, "PATCH", body), ctx)).status).toBe(400);
      }
    }
    expect(await db.database.selectFrom("scimGroups").selectAll().where("id", "=", group.id).executeTakeFirstOrThrow()).toEqual(group);
  });

});
