import { setting } from "@/lib/settings/effective";

/** Reads a response body as text, failing once it exceeds the monitor size limit. */
export async function limitedResponseText(response: Response) {
  return boundedResponseText(response, setting("monitorMaxResponseBytes"));
}

/** Bounds bytes before decoding provider, identity and webhook responses. */
export async function boundedResponseText(response: Response, limit: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    await response.body?.cancel();
    throw new Error(`Response body exceeds the ${limit}-byte response limit`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(`Response body exceeds the ${limit}-byte response limit`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** Longest response excerpt stored with a failed check. */
export const RESPONSE_PREVIEW_BYTES = 4_096;

/** The first `maxBytes` of a response body as text; the rest is discarded. NUL bytes are dropped because PostgreSQL text cannot hold them. */
export async function readResponsePreview(response: Response, maxBytes = RESPONSE_PREVIEW_BYTES) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, maxBytes)).replaceAll("\0", "");
}
