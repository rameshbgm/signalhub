import type { ProxyTrustMode } from "@/lib/proxy-trust";
import { hstsValue, secureCookieDecision } from "@/lib/settings/request";
import type { SettingValues } from "@/lib/settings/registry";

/**
 * A plain-language checklist of the settings that matter for security, read from
 * what is in force. Advice only: nothing here changes anything or blocks anything.
 */
export type PostureStatus = "ok" | "warn" | "info";
export type PostureItem = { id: string; status: PostureStatus; title: string; detail: string };
export type PostureInput = {
  settings: SettingValues;
  proxy: { mode: ProxyTrustMode; hops: number; cidrs: string[] };
  scheme: "https" | "http" | null;
  behindProxy: "yes" | "no" | "unknown";
  /** Rate limits set looser than their defaults. */
  loosenedLimits: number;
};

export function securityPosture(input: PostureInput): { items: PostureItem[]; score: number } {
  const { settings, proxy } = input;
  const items: PostureItem[] = [];
  const add = (id: string, status: PostureStatus, title: string, detail: string) => items.push({ id, status, title, detail });

  const https = settings.publicUrl?.startsWith("https://") ?? false;
  if (https) add("https", "ok", "The public address uses HTTPS", settings.publicUrl!);
  else if (settings.publicUrl) add("https", "warn", "The public address is plain HTTP", "Sign-ins and cookies travel unencrypted. Use an https address behind a reverse proxy.");
  else add("https", "info", "No public address is set", "Links in emails and single sign-on need one. Set it above.");

  const hsts = hstsValue({ mode: settings.hsts, publicUrl: settings.publicUrl, scheme: input.scheme ?? (https ? "https" : "http") });
  add("hsts", hsts ? "ok" : "info", hsts ? "Browsers are told to use HTTPS only (HSTS)" : "HSTS is not being sent", hsts ? "Sent on HTTPS responses." : "It is sent only over HTTPS with an HTTPS public address, or when set to Always.");

  const secure = secureCookieDecision({ mode: settings.secureCookies, publicUrl: settings.publicUrl, scheme: input.scheme, production: true });
  add("cookies", secure ? "ok" : "info", secure ? "The sign-in cookie is Secure" : "The sign-in cookie is not marked Secure", secure ? "Browsers only send it over HTTPS." : "Needed so a plain-HTTP site can sign in; use HTTPS to get Secure cookies.");

  if (proxy.mode === "on" && !proxy.cidrs.length && input.behindProxy === "no") add("proxy", "warn", "Forwarded addresses are trusted from anyone", "Nothing seems to proxy this server, so visitors could forge their address. Use Auto.");
  else if (proxy.mode !== "off" && !proxy.cidrs.length && input.behindProxy === "yes") add("proxy", "info", "Any private network address is trusted as your proxy", "Pin the proxy's network range so a neighbour on the same network cannot forge an address.");
  else add("proxy", "ok", "Visitor addresses are read safely", proxy.cidrs.length ? `Trusted only from ${proxy.cidrs.join(", ")}.` : "Forwarded addresses are believed only where it is safe.");

  add("admin-network", settings.adminCidrs.length ? "ok" : "info", settings.adminCidrs.length ? "Platform administration is limited to your networks" : "Platform administration is open to any network", settings.adminCidrs.length ? settings.adminCidrs.join(", ") : "Sign-in and roles still protect it; limit it to your office or VPN for defence in depth.");

  const idleHours = settings.sessionIdleSeconds / 3600;
  add("sessions", idleHours > 24 ? "warn" : "ok", idleHours > 24 ? "Sessions stay open a long time when idle" : "Idle sessions end promptly", `Signed out after ${idleHours >= 1 ? `${Math.round(idleHours * 10) / 10} h` : `${Math.round(settings.sessionIdleSeconds / 60)} min`} of inactivity.`);

  add("passwords", settings.passwordMinLength >= 14 ? "ok" : "warn", settings.passwordMinLength >= 14 ? "Passwords must be long" : "Short passwords are allowed", `Minimum ${settings.passwordMinLength} characters.`);
  add("monitor-targets", settings.monitorAllowPrivateTargets ? "info" : "ok", settings.monitorAllowPrivateTargets ? "Monitors may check private addresses" : "Monitors cannot reach private networks", settings.monitorAllowPrivateTargets ? "Anyone who can create a monitor can make this server request internal services." : "Protects internal services from server-side request forgery.");
  add("rate-limits", input.loosenedLimits ? "info" : "ok", input.loosenedLimits ? `${input.loosenedLimits} rate limit${input.loosenedLimits === 1 ? " is" : "s are"} looser than the default` : "Rate limits are at their defaults or tighter", "Review them under Abuse protection if the change was not deliberate.");

  const score = Math.round((items.filter((item) => item.status === "ok").length / items.length) * 100);
  return { items, score };
}
