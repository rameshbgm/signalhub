/** One date window shared by the public previews and the complete history. */
export function historyWindowStart(days: number, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  return cutoff;
}

export function recentHistory<T extends { createdAt: Date }>(incidents: T[], days: number, now = new Date()): T[] {
  const cutoff = historyWindowStart(days, now);
  return incidents
    .filter((incident) => incident.createdAt >= cutoff && incident.createdAt <= now)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}
