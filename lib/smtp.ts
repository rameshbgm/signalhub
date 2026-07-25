import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

export function smtpTransport() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP is not configured");
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    ...(process.env.SMTP_USERNAME
      ? {
          auth: {
            user: process.env.SMTP_USERNAME,
            pass: process.env.SMTP_PASSWORD ?? "",
          },
        }
      : {}),
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  return transporter;
}

export async function verifySmtp() {
  if (!smtpConfigured()) return { configured: false, ok: false, error: null };
  try {
    await smtpTransport().verify();
    return { configured: true, ok: true, error: null };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : "SMTP verification failed",
    };
  }
}

export function resetSmtpTransportForTests() {
  transporter?.close();
  transporter = null;
}
