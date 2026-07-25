import { expect, test } from "@playwright/test";

test("health and OpenAPI endpoints describe a ready product surface", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.ok()).toBeTruthy();
  await expect(live.json()).resolves.toMatchObject({ live: true, service: "signalhub-web" });

  const openapi = await request.get("/api/openapi");
  expect(openapi.ok()).toBeTruthy();
  const document = await openapi.json();
  expect(document.openapi).toBe("3.1.0");
  expect(document.paths["/api/v1/manage/incidents"]).toBeTruthy();
  expect(document.paths["/api/scim/v2/{connection}/Users"]).toBeTruthy();
});

test("tenant and platform login surfaces expose working authentication controls", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();

  await page.goto("/platform/login");
  await expect(page.getByRole("heading", { name: "Platform admin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});
