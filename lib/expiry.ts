const DAY_MS = 86_400_000;

export type ExpiryAlert = { notify: boolean; daysLeft: number };

/**
 * Decides whether an expiry warning is due. Each expiry date warns once: after a
 * renewal the date changes, so the next period warns again when it gets close.
 */
export function expiryAlert(input: { expiresAt: Date; warnDays: number; notifiedFor: Date | null; now?: Date }): ExpiryAlert {
  const now = input.now ?? new Date();
  const daysLeft = Math.floor((input.expiresAt.getTime() - now.getTime()) / DAY_MS);
  const due = input.expiresAt.getTime() - now.getTime() <= input.warnDays * DAY_MS;
  const alreadyWarned = input.notifiedFor?.getTime() === input.expiresAt.getTime();
  return { notify: due && !alreadyWarned, daysLeft };
}

/** "expires in 5 days", "expires today", "expired 2 days ago". */
export function expiryPhrase(daysLeft: number) {
  if (daysLeft > 1) return `expires in ${daysLeft} days`;
  if (daysLeft === 1) return "expires in 1 day";
  if (daysLeft === 0) return "expires today";
  return `expired ${-daysLeft} ${daysLeft === -1 ? "day" : "days"} ago`;
}
