function normalizedLocale(language?: string | null) {
  const candidate = language?.trim() || "en";
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([candidate])[0] ?? "en";
  } catch {
    return "en";
  }
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizedTimeZone(timeZone?: string | null) {
  const candidate = timeZone?.trim() || "UTC";
  return isValidTimeZone(candidate) ? candidate : "UTC";
}

/** Offset in milliseconds between `timeZone` wall-clock time and UTC at `instant`. */
function timeZoneOffset(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  const wallClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wallClock - Math.floor(instant / 1000) * 1000;
}

/**
 * Interprets a `datetime-local` value ("YYYY-MM-DDTHH:mm") as wall-clock time
 * in the page's time zone and returns the matching instant.
 */
export function zonedDateTimeToUtc(value: string, timeZone?: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return new Date(Number.NaN);
  const [, year, month, day, hour, minute] = match.map(Number);
  const zone = normalizedTimeZone(timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset across DST transitions.
  let instant = asUtc - timeZoneOffset(asUtc, zone);
  instant = asUtc - timeZoneOffset(instant, zone);
  return new Date(instant);
}

/** Formats an instant as a `datetime-local` value in the page's time zone. */
export function utcToZonedDateTime(value: Date | number, timeZone?: string | null) {
  const instant = new Date(value).getTime();
  const local = new Date(instant + timeZoneOffset(instant, normalizedTimeZone(timeZone)));
  return local.toISOString().slice(0, 16);
}

export function formatPageDate(
  value: Date | string | number,
  options: {
    language?: string | null;
    timeZone?: string | null;
    dateStyle?: "full" | "long" | "medium" | "short";
    timeStyle?: "full" | "long" | "medium" | "short";
    month?: "numeric" | "2-digit" | "long" | "short" | "narrow";
    day?: "numeric" | "2-digit";
    year?: "numeric" | "2-digit";
    weekday?: "long" | "short" | "narrow";
    hour?: "numeric" | "2-digit";
    minute?: "numeric" | "2-digit";
    second?: "numeric" | "2-digit";
  } = {}
) {
  const {
    language,
    timeZone,
    dateStyle,
    timeStyle,
    month,
    day,
    year,
    weekday,
    hour,
    minute,
    second,
  } = options;
  return new Intl.DateTimeFormat(normalizedLocale(language), {
    timeZone: normalizedTimeZone(timeZone),
    dateStyle,
    timeStyle,
    month,
    day,
    year,
    weekday,
    hour,
    minute,
    second,
  }).format(new Date(value));
}

export function pageDateKey(
  value: Date | string | number,
  timeZone?: string | null
) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: normalizedTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
