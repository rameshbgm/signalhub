import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClientRequestTimeoutError,
  fetchWithTimeout,
} from "@/lib/client-fetch";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("fetchWithTimeout", () => {
  it("returns successful responses", async () => {
    const response = new Response(null, { status: 204 });
    globalThis.fetch = vi.fn().mockResolvedValue(response);

    await expect(fetchWithTimeout("https://example.test", {}, 50)).resolves.toBe(response);
  });

  it("aborts a stalled request and rejects with a timeout error", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })
    );

    const request = fetchWithTimeout("https://example.test", {}, 1_000);
    const assertion = expect(request).rejects.toBeInstanceOf(ClientRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("preserves cancellation from the caller", async () => {
    const caller = new AbortController();
    globalThis.fetch = vi.fn((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })
    );

    const request = fetchWithTimeout(
      "https://example.test",
      { signal: caller.signal },
      10_000
    );
    caller.abort(new Error("cancelled"));

    await expect(request).rejects.toThrow("cancelled");
  });
});
