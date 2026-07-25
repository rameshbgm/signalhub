import { describe, expect, it } from "vitest";
import { sanitizeCustomCss, scopeCustomCss } from "../lib/custom-css";
import { isPrivateAddress } from "../lib/target-validation";

describe("public-surface guards", () => {
  it("rejects private, loopback, and mapped private monitor targets", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.10.2")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::ffff:172.16.1.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("scopes safe CSS and rejects external resource loading", () => {
    const css = sanitizeCustomCss(".panel, body { color: #123456; }");
    expect(scopeCustomCss(css, "page-1")).toContain('[data-status-page="page-1"] .panel');
    expect(() => sanitizeCustomCss('@import url("https://example.test/x.css");')).toThrow(
      "cannot load external resources"
    );
  });
});
