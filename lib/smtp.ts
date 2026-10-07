import nodemailer from "nodemailer";
import { getDeliveryConfig, type SmtpConfig } from "@/lib/delivery-config";

let cached: { key: string; transporter: nodemailer.Transporter } | null = null;

export async function smtpConfigured() {
  return Boolean((await getDeliveryConfig()).smtp);
}

export function createSmtpTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.username
      ? {
          // Never send credentials in clear text: require STARTTLS when not using implicit TLS.
          requireTLS: true,
          auth: {
            user: config.username,
            pass: config.password ?? "",
          },
        }
      : {}),
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
}

/** Rebuilds the transporter whenever the stored SMTP configuration changes. */
export async function smtpTransport() {
  const { smtp } = await getDeliveryConfig();
  if (!smtp) throw new Error("SMTP is not configured");
  const key = JSON.stringify(smtp);
  if (cached?.key !== key) cached = { key, transporter: createSmtpTransport(smtp) };
  return { transporter: cached.transporter, from: smtp.from };
}

export async function verifySmtp() {
  if (!(await smtpConfigured())) return { configured: false, ok: false, error: null };
  try {
    await (await smtpTransport()).transporter.verify();
    return { configured: true, ok: true, error: null };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : "SMTP verification failed",
    };
  }
}
