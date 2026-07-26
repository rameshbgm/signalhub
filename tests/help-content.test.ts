import { describe, expect, it } from "vitest";
import { HELP_CATEGORIES } from "../lib/help-content";

describe("help center coverage", () => {
  it("keeps category and article routes unique", () => {
    expect(new Set(HELP_CATEGORIES.map((category) => category.slug)).size).toBe(HELP_CATEGORIES.length);
    for (const category of HELP_CATEGORIES) {
      expect(new Set(category.articles.map((article) => article.slug)).size).toBe(category.articles.length);
    }
  });

  it("covers operator, designer, developer, security, and platform workflows", () => {
    const searchable = JSON.stringify(HELP_CATEGORIES).toLowerCase();
    for (const term of [
      "designer, saving, and versions",
      "component status automation",
      "notifications and destinations",
      "monitors",
      "security",
      "management api quickstart",
      "platform operations",
    ]) {
      expect(searchable).toContain(term);
    }
  });
});
