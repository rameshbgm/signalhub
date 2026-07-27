export const AUDIT_RETENTION_MONTHS = 6;

export function auditRetentionCutoff(now = new Date()) {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - AUDIT_RETENTION_MONTHS);
  const lastDayOfTargetMonth = new Date(Date.UTC(
    cutoff.getUTCFullYear(),
    cutoff.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return cutoff;
}
