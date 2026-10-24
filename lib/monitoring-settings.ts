import { database } from "@/lib/postgres/client";

/** How many days before expiry a certificate or domain warning is sent. */
export const MONITORING_BOUNDS = {
  certExpiryWarnDays: { min: 1, max: 365 },
  domainExpiryWarnDays: { min: 1, max: 365 },
} as const;

export type EffectiveMonitoringSettings = { [Key in keyof typeof MONITORING_BOUNDS]: number };

export const FALLBACK_MONITORING_SETTINGS: EffectiveMonitoringSettings = { certExpiryWarnDays: 14, domainExpiryWarnDays: 30 };

function bounded(value: number | undefined, key: keyof typeof MONITORING_BOUNDS) {
  const { min, max } = MONITORING_BOUNDS[key];
  return Math.min(max, Math.max(min, Number(value ?? FALLBACK_MONITORING_SETTINGS[key])));
}

/** The organization's own setting, else the platform default row (org_id NULL), else the built-in fallback. */
export async function effectiveMonitoringSettings(orgId: string): Promise<EffectiveMonitoringSettings> {
  const rows = await database.selectFrom("monitoringSettings").selectAll()
    .where((eb) => eb.or([eb("orgId", "=", orgId), eb("orgId", "is", null)])).execute();
  const own = rows.find((row) => row.orgId === orgId);
  const platform = rows.find((row) => row.orgId === null);
  return {
    certExpiryWarnDays: bounded(own?.certExpiryWarnDays ?? platform?.certExpiryWarnDays, "certExpiryWarnDays"),
    domainExpiryWarnDays: bounded(own?.domainExpiryWarnDays ?? platform?.domainExpiryWarnDays, "domainExpiryWarnDays"),
  };
}
