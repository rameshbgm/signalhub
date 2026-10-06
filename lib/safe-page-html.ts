const MAX_HTML_BYTES = 20 * 1024;
const ALLOWED_TAGS = "b|strong|i|em|u|p|br|span|div|small|ul|ol|li|h2|h3|h4";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Allowlist sanitizer for custom page header/footer HTML. Everything is
 * escaped first; only attribute-free formatting tags and plain http(s) links
 * are restored, so no script, handler, style, or URL scheme can survive.
 */
export function sanitizePageHtml(input: string) {
  const html = input.trim();
  if (!html) return null;
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new Error("Custom HTML must be 20 KB or smaller");
  }
  return escapeHtml(html.replace(/<!--[\s\S]*?-->/g, ""))
    .replace(new RegExp(`&lt;(/?)(${ALLOWED_TAGS})\\s*(/?)&gt;`, "gi"), (_, close: string, tag: string, selfClose: string) =>
      `<${close}${tag.toLowerCase()}${selfClose ? " /" : ""}>`)
    .replace(/&lt;a\s+href=&quot;(https?:\/\/[^\s&<>]+)&quot;\s*&gt;/gi, (_, url: string) =>
      `<a href="${url}" rel="noopener noreferrer nofollow">`)
    .replace(/&lt;\/a\s*&gt;/gi, "</a>");
}
