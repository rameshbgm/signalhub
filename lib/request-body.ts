/** Server-side body limits apply to actual bytes, including chunked requests. No database dependency. */
export class BodyInputError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export function requestBodyLimit(pathname: string) {
  if (/^\/api\/admin\/pages\/[^/]+\/assets$/.test(pathname)) return 6 * 1024 * 1024;
  if (/^\/api\/auth\/saml\/[^/]+\/acs$/.test(pathname)) return 1024 * 1024;
  if (pathname.startsWith("/api/scim/")) return 2 * 1024 * 1024;
  return 64 * 1024;
}

export async function boundedBodyBytes(request: Request, limit: number, timeoutMs = 15_000) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    throw new BodyInputError(400, "INVALID_CONTENT_LENGTH", "Invalid request length");
  }
  if (declared !== null && Number(declared) > limit) {
    void request.body?.cancel().catch(() => undefined);
    throw new BodyInputError(413, "BODY_TOO_LARGE", "Request body is too large");
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BodyInputError(408, "BODY_TIMEOUT", "Request body timed out")), timeoutMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new BodyInputError(413, "BODY_TOO_LARGE", "Request body is too large");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export function bodyErrorResponse(request: Request, error: unknown) {
  const issue = error instanceof BodyInputError ? error : new BodyInputError(400, "INVALID_BODY", "Malformed request body");
  const body = new URL(request.url).pathname.startsWith("/api/scim/")
    ? { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(issue.status), scimType: "invalidValue", detail: issue.message }
    : { error: { code: issue.code, message: issue.message } };
  return Response.json(body, { status: issue.status, headers: { "cache-control": "no-store" } });
}

export async function readRequestJson(request: Request): Promise<unknown | Response> {
  try {
    const bytes = await boundedBodyBytes(request, requestBodyLimit(new URL(request.url).pathname));
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) { return bodyErrorResponse(request, error); }
}

export async function readRequestForm(request: Request): Promise<FormData | Response> {
  try {
    const bytes = await boundedBodyBytes(request, requestBodyLimit(new URL(request.url).pathname));
    return await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch (error) { return bodyErrorResponse(request, error); }
}
