export function instanceBranding(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const name = env.SIGNALHUB_INSTANCE_NAME?.trim() || "SignalHub";
  const logo = env.SIGNALHUB_INSTANCE_LOGO_URL?.trim();
  // Match public page image formats; never emit executable or protocol-relative URLs.
  const logoUrl = logo && (/^https?:\/\//i.test(logo) || /^\/api\/assets\/[0-9a-f-]{36}$/i.test(logo)) ? logo : null;
  return { name, logoUrl };
}
