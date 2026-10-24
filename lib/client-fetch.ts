export const DEFAULT_CLIENT_REQUEST_TIMEOUT_MS = 15_000;

export class ClientRequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "ClientRequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Browser fetch with a finite deadline. The caller's AbortSignal is preserved,
 * while a second internal signal guarantees that UI pending state can always
 * reach its catch/finally path when the network stalls.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_CLIENT_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;

  const forwardAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener("abort", forwardAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new ClientRequestTimeoutError(timeoutMs));
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ClientRequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}
