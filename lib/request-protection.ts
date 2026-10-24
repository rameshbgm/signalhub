import { BodyInputError, bodyErrorResponse, requestBodyLimit } from "@/lib/request-body";

/** Browser-origin protection for API writes; native clients may omit Origin. */
export function guardApiRequest(request: Request, configuredUrl = process.env.NEXT_PUBLIC_APP_URL) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
  // SAML deliberately uses a cross-site form POST, protected by its signed browser transaction.
  const samlCallback = /^\/api\/auth\/saml\/[^/]+\/acs$/.test(url.pathname);
  if (!samlCallback) {
    const origin = request.headers.get("origin");
    const hosts = new Set([request.headers.get("host") ?? url.host]);
    if (configuredUrl) {
      try { hosts.add(new URL(configuredUrl).host); } catch { /* Invalid config does not relax the check. */ }
    }
    let allowed = true;
    if (origin) {
      try {
        const source = new URL(origin);
        allowed = ["http:", "https:"].includes(source.protocol) && source.origin === origin && hosts.has(source.host);
      } catch { allowed = false; }
    } else {
      const site = request.headers.get("sec-fetch-site");
      allowed = !site || site === "same-origin" || site === "none";
    }
    if (!allowed) return Response.json({ error: { code: "CROSS_ORIGIN_REQUEST", message: "Cross-origin API writes are not allowed" } }, { status: 403 });
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    return bodyErrorResponse(request, new BodyInputError(400, "INVALID_CONTENT_LENGTH", "Invalid request length"));
  }
  if (length !== null && Number(length) > requestBodyLimit(url.pathname)) {
    return bodyErrorResponse(request, new BodyInputError(413, "BODY_TOO_LARGE", "Request body is too large"));
  }
  return null;
}
