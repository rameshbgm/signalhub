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
  SINCH: { label: "Sinch", accountLabel: "Service plan ID", secretLabel: "API token", hint: "Dashboard → SMS → APIs. US region endpoint." },
  CLICKSEND: { label: "ClickSend", accountLabel: "Username", secretLabel: "API key", hint: "Dashboard → Developers → API credentials." },
  TEXTMAGIC: { label: "Textmagic", accountLabel: "Username", secretLabel: "API key", hint: "Services → API → Add new API key." },
  AFRICASTALKING: { label: "Africa's Talking", accountLabel: "Username", secretLabel: "API key", hint: "Settings → API key. Use the app username, not \"sandbox\", for live delivery." },
};

export const SMS_PROVIDER_IDS = Object.keys(SMS_PROVIDERS) as SmsProvider[];

/** Common services that accept SMTP; choosing one fills host, port, TLS and the usual username. */
export const SMTP_PRESETS = [
  { id: "custom", label: "Custom SMTP server", host: "", port: 587, secure: false, username: "", hint: "" },
  { id: "ses", label: "Amazon SES", host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false, username: "", hint: "Change the region in the host. Use SES SMTP credentials, not IAM access keys." },
  { id: "brevo", label: "Brevo", host: "smtp-relay.brevo.com", port: 587, secure: false, username: "", hint: "Use the SMTP login and SMTP key from SMTP & API settings." },
  { id: "elasticemail", label: "Elastic Email", host: "smtp.elasticemail.com", port: 2525, secure: false, username: "", hint: "Username is your account email; the password is an SMTP credential from Settings → SMTP." },
  { id: "fastmail", label: "Fastmail", host: "smtp.fastmail.com", port: 465, secure: true, username: "", hint: "Use an app password with SMTP access." },
  { id: "gmail", label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 465, secure: true, username: "", hint: "Use an app password; the From address must be the account or an alias." },
  { id: "icloud", label: "iCloud Mail", host: "smtp.mail.me.com", port: 587, secure: false, username: "", hint: "Use an app-specific password from appleid.apple.com." },
  { id: "mailersend", label: "MailerSend", host: "smtp.mailersend.net", port: 587, secure: false, username: "", hint: "Use the SMTP user and password from Domains → SMTP." },
  { id: "mailgun", label: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false, username: "", hint: "Use the domain's SMTP login, e.g. postmaster@mg.example.com. EU: smtp.eu.mailgun.org." },
  { id: "mailjet", label: "Mailjet", host: "in-v3.mailjet.com", port: 587, secure: false, username: "", hint: "Username is the API key; the password is the secret key." },
  { id: "mailtrap", label: "Mailtrap", host: "live.smtp.mailtrap.io", port: 587, secure: false, username: "api", hint: "Username is \"api\"; the password is your API token. Verify the sending domain first." },
  { id: "microsoft365", label: "Microsoft 365", host: "smtp.office365.com", port: 587, secure: false, username: "", hint: "Requires SMTP AUTH enabled for the mailbox." },
  { id: "outlook", label: "Outlook.com", host: "smtp-mail.outlook.com", port: 587, secure: false, username: "", hint: "Personal Outlook or Hotmail accounts; use an app password when two-step verification is on." },
  { id: "postmark", label: "Postmark", host: "smtp.postmarkapp.com", port: 587, secure: false, username: "", hint: "Use the server API token as both username and password." },
  { id: "resend", label: "Resend", host: "smtp.resend.com", port: 465, secure: true, username: "resend", hint: "Username is \"resend\"; the password is your API key." },
  { id: "sendgrid", label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false, username: "apikey", hint: "Username is literally \"apikey\"; the password is your API key." },
  { id: "smtp2go", label: "SMTP2GO", host: "mail.smtp2go.com", port: 587, secure: false, username: "", hint: "Use an SMTP user from Sending → SMTP users." },
  { id: "sparkpost", label: "SparkPost", host: "smtp.sparkpostmail.com", port: 587, secure: false, username: "SMTP_Injection", hint: "Username is \"SMTP_Injection\"; the password is an API key with Send via SMTP. EU: smtp.eu.sparkpostmail.com." },
  { id: "yahoo", label: "Yahoo Mail", host: "smtp.mail.yahoo.com", port: 465, secure: true, username: "", hint: "Use an app password from Account security." },
  { id: "zoho", label: "Zoho Mail", host: "smtp.zoho.com", port: 465, secure: true, username: "", hint: "EU accounts use smtp.zoho.eu; India smtp.zoho.in." },
] as const;

/** The preset whose host matches, for showing which service a saved server is. */
export function smtpPresetFor(host: string | null) {
  return SMTP_PRESETS.find((preset) => preset.host && preset.host === host) ?? SMTP_PRESETS[0];
}
