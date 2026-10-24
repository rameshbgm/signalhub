import { describe, expect, it } from "vitest";
import { sanitizeCustomCss, scopeCustomCss } from "../lib/custom-css";
import { isPrivateAddress, validateNetworkHost } from "../lib/target-validation";

describe("public-surface guards", () => {
  it("rejects private, loopback, and mapped private monitor targets", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.10.2")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::ffff:172.16.1.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("rejects private IPv4 hidden in IPv6 spellings", () => {
    // WHATWG URL canonicalizes [::ffff:127.0.0.1] to [::ffff:7f00:1].
    expect(isPrivateAddress(new URL("http://[::ffff:127.0.0.1]/").hostname.slice(1, -1))).toBe(true);
    expect(isPrivateAddress("::ffff:a9fe:a9fe")).toBe(true);
    expect(isPrivateAddress("::7f00:1")).toBe(true);
    expect(isPrivateAddress("64:ff9b::a9fe:a9fe")).toBe(true);
    expect(isPrivateAddress("2002:7f00:1::1")).toBe(true);
    expect(isPrivateAddress("fec0::1")).toBe(true);
    expect(isPrivateAddress("ff02::1")).toBe(true);
    expect(isPrivateAddress("198.18.0.1")).toBe(true);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateAddress("64:ff9b::808:808")).toBe(false);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("refuses network hosts that a CLI would read as options", async () => {
    await expect(validateNetworkHost("-f", true)).rejects.toThrow("Target host is invalid");
  });

  it("scopes safe CSS and rejects external resource loading", () => {
    const css = sanitizeCustomCss(".panel, body { color: #123456; }");
    expect(scopeCustomCss(css, "page-1")).toContain('[data-status-page="page-1"] .panel');
    expect(() => sanitizeCustomCss('@import url("https://example.test/x.css");')).toThrow(
      "cannot load external resources"
    );
    // CSS escapes decode before tokenizing: u\72l( is url(.
    expect(() => sanitizeCustomCss('.a { background: u\\72l(https://example.test/x.png); }')).toThrow(
      "cannot load external resources"
    );
  });
});
