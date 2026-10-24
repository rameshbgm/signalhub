import { fetchWithTimeout } from "@/lib/client-fetch";

export type MfaCallResult<T> = { ok: true; body: T } | { ok: false; error: string; code: string | null; status: number };

/** One call to the MFA API. Never throws: failures come back as a message safe to show. */
export async function mfaCall<T = Record<string, unknown>>(path: string, payload?: Record<string, unknown>): Promise<MfaCallResult<T>> {
  try {
    const response = await fetchWithTimeout(path, payload
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
      : undefined);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, status: response.status, code: body.error?.code ?? null, error: body.error?.message ?? "Something went wrong. Try again." };
    }
    return { ok: true, body: body as T };
  } catch {
    return { ok: false, status: 0, code: null, error: "Request timed out. Check your connection and try again." };
  }
}

export const mfaAction = <T = Record<string, unknown>>(action: string, extra: Record<string, unknown> = {}) =>
  mfaCall<T>("/api/auth/mfa", { action, ...extra });
