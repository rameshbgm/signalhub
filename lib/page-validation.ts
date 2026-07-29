import {
  PAGE_TEMPLATE_KEYS,
  type PageTemplateKey,
} from "@/lib/page-design";

const LEGACY_LAYOUTS: Record<string, PageTemplateKey> = {
  STANDARD: "CENTERED_SUMMARY",
  COVER: "ILLUSTRATED_HERO",
  MINIMAL: "MINIMAL_ENTERPRISE",
};

export function validatedBrandColor(value: string) {
  const color = value.trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error("Brand color must be a six-digit hex color");
  }
  return color;
}

export function validatedLayout(value: string) {
  if (PAGE_TEMPLATE_KEYS.includes(value as PageTemplateKey)) return value as PageTemplateKey;
  return LEGACY_LAYOUTS[value] ?? "CENTERED_SUMMARY";
}

export function validatedExternalUrl(
  value: string,
  options: { allowMailto?: boolean; label?: string } = {}
) {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const protocols = options.allowMailto ? ["https:", "http:", "mailto:"] : ["https:", "http:"];
    if (!protocols.includes(url.protocol)) throw new Error();
    if (url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${options.label ?? "URL"} must be an absolute HTTP${options.allowMailto ? "(S) or mailto" : "(S)"} URL`);
  }
}

export function validatedTimezone(value: string) {
  const timezone = value.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new Error("Timezone must be a valid IANA timezone, such as UTC or Asia/Singapore");
  }
}

export function validatedLanguage(value: string) {
  const language = value.trim() || "en";
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language)) {
    throw new Error("Language must be a valid code such as en or en-US");
  }
  return language;
}
