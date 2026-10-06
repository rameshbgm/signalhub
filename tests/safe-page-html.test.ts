import { describe, expect, it } from "vitest";
import { sanitizePageHtml } from "../lib/safe-page-html";

describe("sanitizePageHtml", () => {
  it("keeps attribute-free formatting and http(s) links", () => {
    expect(sanitizePageHtml('<p>Hi <strong>all</strong><br/><a href="https://example.com/help">help</a></p>'))
      .toBe('<p>Hi <strong>all</strong><br /><a href="https://example.com/help" rel="noopener noreferrer nofollow">help</a></p>');
  });

  it("neutralizes known regex-sanitizer bypasses", () => {
    const payloads = [
      "<img/onerror=alert(1) src=x>",
      "<a href=javascript:alert(1)>x</a>",
      '<a href="javascript:alert(1)">x</a>',
      "<svg><script>alert(1)</script></svg>",
      "<scr<script>ipt>alert(1)</script>",
      '<p onclick="alert(1)">x</p>',
      '<div style="background:url(javascript:alert(1))">x</div>',
      '<a href="https://ok.example" onmouseover="alert(1)">x</a>',
    ];
    for (const payload of payloads) {
      const output = sanitizePageHtml(payload) ?? "";
      expect(output).not.toMatch(/<(?!\/?(?:b|strong|i|em|u|p|br|span|div|small|ul|ol|li|h2|h3|h4|a)\b)/i);
      expect(output).not.toMatch(/<[^>]*\son\w+=/i);
      expect(output).not.toMatch(/<a href="(?!https?:)/i);
    }
  });

  it("rejects oversize input and returns null for empty input", () => {
    expect(sanitizePageHtml("   ")).toBeNull();
    expect(() => sanitizePageHtml("x".repeat(21 * 1024))).toThrow(/20 KB/);
  });
});
