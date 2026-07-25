export function normalizedLocale(language?: string | null) {
  const candidate = language?.trim() || "en";
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([candidate])[0] ?? "en";
  } catch {
    return "en";
  }
}

export function normalizedTimeZone(timeZone?: string | null) {
  const candidate = timeZone?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "UTC";
  }
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
