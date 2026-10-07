/**
 * Subscriber email presets and SMS providers for the platform console.
 * Client-safe: labels and defaults only; delivery lives in lib/notification-providers.
 */
import type { SmsProvider } from "@/lib/postgres/schema";

export const SMS_PROVIDERS: Record<SmsProvider, {
  label: string;
  accountLabel: string | null;
  secretLabel: string;
  hint: string;
}> = {
  TWILIO: { label: "Twilio", accountLabel: "Account SID", secretLabel: "Auth token", hint: "Console → Account info." },
  VONAGE: { label: "Vonage (Nexmo)", accountLabel: "API key", secretLabel: "API secret", hint: "Dashboard → API settings. The sender may be a number or an alphanumeric ID." },
  PLIVO: { label: "Plivo", accountLabel: "Auth ID", secretLabel: "Auth token", hint: "Console → Overview." },
  TELNYX: { label: "Telnyx", accountLabel: null, secretLabel: "API key (v2)", hint: "Portal → API keys. The sender must be a Telnyx number with a messaging profile." },
};

export const SMS_PROVIDER_IDS = Object.keys(SMS_PROVIDERS) as SmsProvider[];

/** Common services that accept SMTP; choosing one fills host, port, TLS and the usual username. */
export const SMTP_PRESETS = [
  { id: "custom", label: "Custom SMTP server", host: "", port: 587, secure: false, username: "", hint: "" },
  { id: "ses", label: "Amazon SES", host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false, username: "", hint: "Change the region in the host. Use SES SMTP credentials, not IAM access keys." },
  { id: "sendgrid", label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false, username: "apikey", hint: "Username is literally \"apikey\"; the password is your API key." },
  { id: "mailgun", label: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false, username: "", hint: "Use the domain's SMTP login, e.g. postmaster@mg.example.com. EU: smtp.eu.mailgun.org." },
  { id: "postmark", label: "Postmark", host: "smtp.postmarkapp.com", port: 587, secure: false, username: "", hint: "Use the server API token as both username and password." },
  { id: "brevo", label: "Brevo", host: "smtp-relay.brevo.com", port: 587, secure: false, username: "", hint: "Use the SMTP login and SMTP key from SMTP & API settings." },
  { id: "resend", label: "Resend", host: "smtp.resend.com", port: 465, secure: true, username: "resend", hint: "Username is \"resend\"; the password is your API key." },
  { id: "microsoft365", label: "Microsoft 365", host: "smtp.office365.com", port: 587, secure: false, username: "", hint: "Requires SMTP AUTH enabled for the mailbox." },
  { id: "gmail", label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 465, secure: true, username: "", hint: "Use an app password; the From address must be the account or an alias." },
] as const;
