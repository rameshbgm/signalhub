import { expect, test } from "@playwright/test";

test.describe("button interaction guard", () => {
  test("blocks duplicate UI clicks and releases the short lock", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const button = document.createElement("button");
      button.id = "guard-ui-button";
      button.type = "button";
      button.textContent = "Close";
      button.addEventListener("click", () => {
        const state = window as typeof window & { guardClickCount?: number };
        state.guardClickCount = (state.guardClickCount ?? 0) + 1;
      });
      document.body.append(button);
    });

    const button = page.locator("#guard-ui-button");
    await button.click();
    await button.dispatchEvent("click");

    await expect(button).toHaveAttribute("data-button-busy", "interaction");
    await expect.poll(() => page.evaluate(() => (window as typeof window & { guardClickCount?: number }).guardClickCount)).toBe(1);

    await expect(button).not.toHaveAttribute("data-button-guard-locked", "true");
    await button.click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { guardClickCount?: number }).guardClickCount)).toBe(2);
  });

  test("shows action progress, suppresses duplicate submits, and recovers on timeout", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const form = document.createElement("form");
      const button = document.createElement("button");
      button.id = "guard-submit-button";
      button.type = "submit";
      button.textContent = "Save settings";
      button.dataset.buttonTimeoutMs = "600";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const state = window as typeof window & { guardSubmitCount?: number };
        state.guardSubmitCount = (state.guardSubmitCount ?? 0) + 1;
      });
      form.append(button);
      document.body.append(form);
    });

    const button = page.locator("#guard-submit-button");
    await button.click();
    await button.dispatchEvent("click");

    await expect(button).toHaveAttribute("data-button-busy", "saving");
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => page.evaluate(() => (window as typeof window & { guardSubmitCount?: number }).guardSubmitCount)).toBe(1);

    await expect(page.getByRole("status")).toContainText("Save settings timed out. Please try again.");
    await expect(button).not.toHaveAttribute("data-button-guard-locked", "true");

    await button.click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { guardSubmitCount?: number }).guardSubmitCount)).toBe(2);
  });
});
