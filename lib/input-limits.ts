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
  /** Characters in a CSV import; keeps the request well under Next's 1 MB server action body limit. */
  csvText: 500_000,
  monitorTags: 20,
  monitorTag: 50,
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
  /** Platform delivery providers (SMTP and SMS). */
  smtpHost: 255,
  smtpUsername: 255,
  smtpPassword: 1_000,
  /** RFC 5321 path limit for a From address including a display name. */
  smtpFrom: 320,
  smsAccountId: 128,
  smsSecret: 512,
  smsSender: 32,
} as const;

/** Leading "+" and 1–4 digits, e.g. +1 or +353. Also used as the input's pattern attribute. */
export const SMS_COUNTRY_CODE_PATTERN = "\\+[1-9]\\d{0,3}";

/** E.164 phone number: + then 7–15 digits. Also used as the input's pattern attribute. */
export const E164_PATTERN = "\\+[1-9]\\d{6,14}";

/** Comma-separated tags: at most monitorTags entries of monitorTag characters. Used as the input's pattern attribute. */
// Spaces around commas are allowed and not counted, matching the server, which trims each tag.
const TAG = `\\s*[^,]{0,${INPUT_LIMITS.monitorTag}}?\\s*`;
export const MONITOR_TAGS_PATTERN = `${TAG}(,${TAG}){0,${INPUT_LIMITS.monitorTags - 1}}`;
export const MONITOR_TAGS_HINT = `Up to ${INPUT_LIMITS.monitorTags} tags of ${INPUT_LIMITS.monitorTag} characters, separated by commas`;

export function isValidEmail(value: string) {
  return value.length <= INPUT_LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidSmsCountryCode(value: string) {
  return new RegExp(`^${SMS_COUNTRY_CODE_PATTERN}$`).test(value);
}
