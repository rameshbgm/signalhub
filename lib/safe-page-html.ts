const MAX_HTML_BYTES = 20 * 1024;
const BLOCKED_TAGS = /<\s*\/?\s*(?:script|style|iframe|object|embed|form|input|button|meta|link|base)[^>]*>/gi;
const EVENT_HANDLER = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const UNSAFE_URL = /\s+(href|src)\s*=\s*(["'])\s*(?:javascript|data|vbscript):[^"']*\2/gi;

export function sanitizePageHtml(input: string) {
  const html = input.trim();
  if (!html) return null;
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new Error("Custom HTML must be 20 KB or smaller");
  }
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(BLOCKED_TAGS, "")
    .replace(EVENT_HANDLER, "")
    .replace(UNSAFE_URL, " $1=\"#\"");
}
