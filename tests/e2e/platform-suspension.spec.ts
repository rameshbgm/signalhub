import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { totpCode } from "../../lib/totp";

const enabled = process.env.E2E_PLATFORM_SUSPENSION === "true";
const databaseUrl = process.env.SUSPENSION_TEST_DATABASE_URL;
const signingKey = process.env.SUSPENSION_TEST_SESSION_SECRET;
test.skip(!enabled || !databaseUrl || !signingKey, "Requires a disposable local suspension-test instance");
if (enabled && (!databaseUrl || !/test/i.test(new URL(databaseUrl).pathname) || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3301").hostname))) throw new Error("Suspension tests require a disposable test database and local application");
test.describe.configure({ mode: "serial" });

const username = "suspension-operator";
const email = "suspension-operator@example.invalid";
const password = "temporary suspension test phrase 4182!";
let db: Pool;
let orgId: string;
let operatorId: string;
let recoveryCodes: string[] = [];
let customer: { id: string; orgId: string; membershipId: string };

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "User ID", exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await page.getByRole("button", { name: "Use a recovery code instead", exact: true }).click();
  await page.getByLabel("Recovery code", { exact: true }).fill(recoveryCodes.shift()!);
  await page.getByRole("button", { name: "Verify and sign in", exact: true }).click();
  await page.waitForURL(/\/organization(?:\/platform)?$/);
  await page.goto("/organization/platform");
}

test.beforeAll(async () => {
  db = new Pool({ connectionString: databaseUrl });
  const admin = (await db.query("select u.id,m.org_id from users u join memberships m on m.user_id=u.id where u.canonical_email=$1 and m.role='ADMIN'", [email])).rows[0];
  operatorId = admin.id; orgId = admin.org_id;
  // The synthetic operator can enroll afresh when a local test run is repeated.
  for (const table of ["mfa_devices", "mfa_recovery_codes", "mfa_recovery_reveals", "mfa_challenges"]) {
    await db.query(`delete from ${table} where user_id=$1`, [operatorId]);
  }
  await db.query("update users set must_change_password=false,must_complete_profile=false where id=$1", [operatorId]);
  const otherOrg = (await db.query("insert into organizations (name,slug) values ('Member organization',$1) returning id", [`suspension-${randomUUID()}`])).rows[0].id;
  const name = `customer-${randomUUID()}`;
  const who = (await db.query("insert into users (name,username,canonical_username,email,canonical_email) values ($1,$1,$1,$2,$2) returning id", [name, `${name}@example.invalid`])).rows[0].id;
  const membership = (await db.query("insert into memberships (org_id,user_id,role,status) values ($1,$2,'RESPONDER','ACTIVE') returning id", [otherOrg, who])).rows[0].id;
  customer = { id: who, orgId: otherOrg, membershipId: membership };
  // Every organization in this explicitly disposable database starts suspended.
  await db.query("update organizations set suspended=true,status='SUSPENDED'");
});
test.afterAll(async () => { await db?.end(); });

test("finishes MFA enrollment and signs an Admin in with no active organization", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "User ID", exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const started = page.waitForResponse(r => r.url().endsWith("/api/auth/mfa") && r.request().method() === "POST" && r.request().postDataJSON()?.action === "start");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set up two-step verification" })).toBeVisible();
  const setup = await (await started).json();
  expect((await page.request.get("/api/platform/diagnostics")).status()).toBe(401);
  await page.getByLabel("Code from your app", { exact: true }).fill(totpCode(setup.secret));
  const confirmed = page.waitForResponse(r => r.url().endsWith("/api/auth/mfa") && r.request().method() === "POST" && r.request().postDataJSON()?.action === "confirm");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  recoveryCodes = (await (await confirmed).json()).recoveryCodes;
  await page.getByRole("checkbox", { name: /saved these/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/\/organization\/platform$/);
  await expect(page.getByText("Platform access is available", { exact: true })).toBeVisible();
  expect((await page.request.get("/api/platform/diagnostics")).status()).toBe(200);
  expect((await page.request.post("/api/admin/api-keys", { data: { name: "Recovery test", scopes: ["status.read"] } })).status()).toBe(401);
  expect((await db.query("select disabled from users where id=$1", [operatorId])).rows[0].disabled).toBe(false);
  expect((await db.query("select status from organizations where id=$1", [orgId])).rows[0].status).toBe("SUSPENDED");
  expect((await db.query("select count(*)::int as count from platform_audit_logs where actor_id=$1 and action='PLATFORM_LOGIN'", [operatorId])).rows[0].count).toBeGreaterThan(0);
  await page.screenshot({ path: "outputs/main-suspension-review/platform-recovery.png", animations: "disabled" });
});

test("signs in again using MFA without exposing suspended workspace data", async ({ page }) => {
  await signIn(page);
  expect((await page.request.get("/api/platform/diagnostics")).status()).toBe(200);
  expect((await page.request.post("/api/admin/api-keys", { data: { name: "Recovery test", scopes: ["status.read"] } })).status()).toBe(401);
  expect((await page.request.post("/api/auth/switch-org", { data: { orgId } })).status()).toBe(403);
  await page.goto("/organization");
  await expect(page).toHaveURL(/\/organization\/platform$/);
});

test("lets the operator explicitly reactivate its organization", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Reactivate Recovery Operations", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect.poll(async () => (await db.query("select status from organizations where id=$1", [orgId])).rows[0].status).toBe("ACTIVE");
  expect((await page.request.post("/api/admin/api-keys", { data: { name: "Recovery test", scopes: ["status.read"] } })).status()).toBe(201);
});

test("keeps platform access after self-suspension, sign-out and another sign-in", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Suspend Recovery Operations", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Suspend", exact: true }).click();
  await expect.poll(async () => (await db.query("select status from organizations where id=$1", [orgId])).rows[0].status).toBe("SUSPENDED");
  await page.reload();
  await expect(page.getByText("Platform access is available", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page);
  expect((await page.request.get("/api/platform/diagnostics")).status()).toBe(200);
  expect((await page.request.post("/api/admin/api-keys", { data: { name: "Recovery test", scopes: ["status.read"] } })).status()).toBe(401);
});

test("denies non-Admin members, disabled operators and revoked sessions", async ({ page, baseURL, browser }) => {
  const id = randomUUID(), verifier = randomBytes(32).toString("base64url");
  await db.query("insert into auth_sessions (id,kind,token_hash,user_id,membership_id,org_id,auth_method,mfa_verified,idle_expires_at,absolute_expires_at) values ($1,'TENANT',$2,$3,$4,$5,'PASSWORD',true,now()+interval '10 minutes',now()+interval '10 minutes')", [id, createHash("sha256").update(verifier).digest("hex"), customer.id, customer.membershipId, customer.orgId]);
  const token = await new SignJWT({ userId: customer.id, membershipId: customer.membershipId, orgId: customer.orgId, role: "RESPONDER", sessionId: id, sessionVerifier: verifier, authMethod: "PASSWORD", mfaVerified: true, mfaAuthenticated: true })
    .setProtectedHeader({ alg: "HS256", kid: "legacy" }).setAudience("org").setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(signingKey!));
  const context = await browser.newContext({ baseURL });
  try {
    await context.addCookies([{ name: "sp_session", value: token, url: baseURL! }]);
    expect((await context.request.get("/api/platform/diagnostics")).status()).toBe(403);
    expect((await context.request.post("/api/admin/api-keys", { data: { name: "Recovery test", scopes: ["status.read"] } })).status()).toBe(401);
  } finally { await context.close(); }
  await signIn(page);
  await db.query("update users set disabled=true where id=$1", [operatorId]);
  try { expect((await page.request.get("/api/platform/diagnostics")).status()).toBe(401); }
  finally { await db.query("update users set disabled=false where id=$1", [operatorId]); }
  await db.query("update auth_sessions set revoked_at=now(),revoked_reason='test' where user_id=$1", [operatorId]);
  expect((await page.request.get("/api/platform/diagnostics")).status()).toBe(401);
});
