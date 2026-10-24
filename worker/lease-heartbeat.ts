export type LeaseHeartbeat = {
  stop: () => Promise<void>;
};

export function startLeaseHeartbeat(
  renew: () => Promise<void>,
  intervalMilliseconds: number
): LeaseHeartbeat {
  if (!Number.isFinite(intervalMilliseconds) || intervalMilliseconds <= 0) {
    throw new Error("Lease renewal interval must be a positive number");
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      inFlight = Promise.resolve()
        .then(renew)
        // A transient failure must not permanently disable the heartbeat. The
        // final ownership check decides whether the worker may commit results.
        .catch(() => undefined)
        .finally(() => {
          inFlight = null;
          schedule();
        });
    }, intervalMilliseconds);
  };

  schedule();

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (inFlight) await inFlight;
    },
  };
}
