// Input limits shared by forms (maxLength/pattern) and server actions (authoritative checks).
// The database has no length constraints, so these are the only bound on stored text.

export const INPUT_LIMITS = {
  /** Page, organization, group, and service names. */
  name: 120,
  /** Incident, maintenance, monitor, and metric names. */
  title: 200,
  description: 1_000,
  /** Incident and maintenance update messages. */
  body: 20_000,
  postmortem: 50_000,
  email: 254,
  url: 2_048,
  password: 1_024,
  secret: 1_024,
  metricSuffix: 20,
  monitorGroup: 100,
  csvContacts: 5_000,
  /** Audited operator reasons (suspend, purge, retry, disable). */
  reasonMin: 10,
  reason: 2_000,
  slug: 80,
  monitorRequestBody: 100_000,
  monitorRequestHeaders: 20_000,
  monitorKeyword: 10_000,
  monitorAuthUsername: 1_000,
  monitorAuthSecret: 10_000,
  monitorAuthHeaderName: 200,
  monitorStatusRange: 7,
} as const;

/** Leading "+" and 1–4 digits, e.g. +1 or +353. Also used as the input's pattern attribute. */
export const SMS_COUNTRY_CODE_PATTERN = "\\+[1-9]\\d{0,3}";

export function isValidEmail(value: string) {
  return value.length <= INPUT_LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidSmsCountryCode(value: string) {
  return new RegExp(`^${SMS_COUNTRY_CODE_PATTERN}$`).test(value);
}
