import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3301",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: /responsive\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Real mobile engines for the overflow checks: WebKit is iOS Safari's engine.
    // Needs `npx playwright install webkit` once.
    { name: "mobile-safari", testMatch: /responsive\.spec\.ts/, use: { ...devices["iPhone 15"] } },
    { name: "mobile-chrome", testMatch: /responsive\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
});
