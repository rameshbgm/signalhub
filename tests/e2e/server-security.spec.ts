import { expect, test } from "@playwright/test";

// Explicit opt-in: this suite writes only to a disposable instance with synthetic credentials.
const base = process.env.SECURITY_E2E_URL;
const username = process.env.SECURITY_E2E_USER;
const password = process.env.SECURITY_E2E_PASSWORD;
const pageId = process.env.SECURITY_E2E_PAGE_ID;
test.skip(!base || !username || !password || !pageId, "Requires a disposable security-test server and fixtures");

test("rejects hostile browser origins, malformed JSON, and oversized bodies while staying available", async ({ request }) => {
  const login = `${base}/api/auth/login`;
  const hostile = await request.post(login, { headers: { origin: "https://attacker.example" }, data: { username, password } });
  expect(hostile.status()).toBe(403);
  expect((await hostile.json()).error.code).toBe("CROSS_ORIGIN_REQUEST");
  expect(hostile.headers()["set-cookie"]).toBeUndefined();
  const metadata = await request.post(login, { headers: { "sec-fetch-site": "cross-site" }, data: {} });
  expect(metadata.status()).toBe(403);
  const malformed = await request.post(login, { headers: { origin: base!, "content-type": "application/json" }, data: Buffer.from("{") });
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).error.code).toBe("INVALID_BODY");
  const oversized = await request.post(login, { headers: { origin: base! }, data: { value: "x".repeat(65 * 1024) } });
  expect(oversized.status()).toBe(413);
  const validation = await request.post(login, { headers: { origin: base! }, data: { username: [], password: null } });
  expect(validation.status()).toBe(400);
  expect((await request.get(`${base}/api/health/live`)).status()).toBe(200);
});

test("denies anonymous administration and redirects protected pages to login", async ({ request }) => {
  expect((await request.post(`${base}/api/admin/api-keys`, { data: {} })).status()).toBe(401);
  const protectedPage = await request.get(`${base}/organization`, { maxRedirects: 0 });
  expect(protectedPage.status()).toBe(307);
  expect(new URL(protectedPage.headers().location, base).pathname).toBe("/login");
});

test("valid browser login, administration, image upload, and logout still work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/login`);
  await page.getByLabel("User ID", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  const login = page.waitForResponse(response => response.url() === `${base}/api/auth/login` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await login).status()).toBe(200);
  await expect(page).toHaveURL(`${base}/organization`);
  const cookie = (await page.context().cookies()).find(item => item.name === "sp_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect((await page.request.get(`${base}/api/auth/mfa`)).status()).toBe(200);

  const uploadUrl = `${base}/api/admin/pages/${pageId}/assets`;
  const invalid = await page.request.post(uploadUrl, { headers: { origin: base! }, multipart: {
    kind: "LOGO", file: { name: "image.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
  } });
  expect(invalid.status()).toBe(400);
  // Valid 16x16 PNG, normalized by the real image pipeline and saved to the test database.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGklEQVQ4jWP4TyFgGDXg/2gY/B8Ng//DIgwAXXj8LuMlDaEAAAAASUVORK5CYII=", "base64");
  const uploaded = await page.request.post(uploadUrl, { headers: { origin: base! }, multipart: {
    kind: "LOGO", file: { name: "logo.png", mimeType: "image/png", buffer: png },
  } });
  expect(uploaded.status()).toBe(200);
  const asset = (await uploaded.json()).asset;
  const download = await page.request.get(`${base}${asset.url}`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toMatch(/^image\//);
  expect((await page.request.delete(`${uploadUrl}?kind=LOGO`, { headers: { origin: base! } })).status()).toBe(200);
  expect((await page.request.post(`${base}/api/auth/logout`, { headers: { origin: base! } })).status()).toBe(200);
  expect((await page.request.post(`${base}/api/admin/api-keys`, { data: {} })).status()).toBe(401);
  expect(errors).toEqual([]);
});
