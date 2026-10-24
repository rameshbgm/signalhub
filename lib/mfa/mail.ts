import { errorFields, logger } from "@/lib/logger";
import { smtpConfigured, smtpTransport } from "@/lib/smtp";

/**
 * Account-security email. Templates are plain functions of non-secret values:
 * no setup key, authenticator code or recovery code ever passes through them
 * (the one deliberate exception, "email my recovery codes", is sendRecoveryCodesMail).
 */
export type MfaMail =
  | { kind: "enabled" }
  | { kind: "device-added"; deviceName: string }
  | { kind: "device-removed"; deviceName: string }
  | { kind: "recovery-used"; remaining: number }
  | { kind: "request-created"; type: "REMOVE_ALL" | "LOST_DEVICE"; cancelUrl: string }
  | { kind: "request-approved"; byBreakGlass?: boolean }
  | { kind: "request-rejected"; note: string }
  | { kind: "admin-reset" }
  | { kind: "admin-new-request"; userLabel: string; reviewUrl: string };

const SIGN_OFF = ["", "If this was not you, change your password and contact your administrator."];

export function renderMfaMail(mail: MfaMail, name: string): { subject: string; text: string } {
  const hello = `Hello ${name},`;
  switch (mail.kind) {
    case "enabled":
      return { subject: "Two-step verification is on for your SignalHub account", text: [hello, "", "Two-step verification with an authenticator app is now active on your account.", ...SIGN_OFF].join("\n") };
    case "device-added":
      return { subject: "A new authenticator was added to your account", text: [hello, "", `The device "${mail.deviceName}" was added to your two-step verification. Browsers you marked as trusted were signed out of it.`, ...SIGN_OFF].join("\n") };
    case "device-removed":
      return { subject: "An authenticator was removed from your account", text: [hello, "", `The device "${mail.deviceName}" was removed from your two-step verification. Browsers you marked as trusted were signed out of it.`, ...SIGN_OFF].join("\n") };
    case "recovery-used":
      return { subject: "A recovery code was used to sign in", text: [hello, "", `A recovery code was just used to sign in to your account. ${mail.remaining} unused ${mail.remaining === 1 ? "code remains" : "codes remain"}.`, ...(mail.remaining < 3 ? ["You are running low: open Security settings and generate new recovery codes."] : []), ...SIGN_OFF].join("\n") };
    case "request-created":
      return { subject: "A request to remove two-step verification was made", text: [hello, "", mail.type === "LOST_DEVICE" ? "Someone said they lost the device for your account and asked an administrator to remove your two-step verification." : "A request was made to remove two-step verification from your account.", "An administrator must approve it. Nothing changes until then.", "", ...(mail.cancelUrl ? ["If this was not you, cancel it now:", mail.cancelUrl] : ["If this was not you, tell your administrator right away."]), "", "The request expires in 7 days."].join("\n") };
    case "request-approved":
      return { subject: "Two-step verification was removed from your account", text: [hello, "", "An administrator approved removing two-step verification. All your devices and recovery codes were deleted and you were signed out everywhere.", "At your next sign-in you will set up a new authenticator before you can continue.", mail.byBreakGlass ? "\nThis was done through the emergency (break-glass) route and is recorded in the audit log." : "", ...SIGN_OFF].join("\n") };
    case "request-rejected":
      return { subject: "Your request to remove two-step verification was declined", text: [hello, "", "An administrator declined your request.", `Note from the administrator: ${mail.note}`, "", "You can file a new request after 24 hours."].join("\n") };
    case "admin-reset":
      return { subject: "An administrator reset your two-step verification", text: [hello, "", "An administrator removed your authenticator devices and recovery codes and signed you out everywhere. You will set up a new authenticator at your next sign-in.", ...SIGN_OFF].join("\n") };
    case "admin-new-request":
      return { subject: "A new two-step verification request needs review", text: [hello, "", `${mail.userLabel} asked to have two-step verification removed.`, "Review it here:", mail.reviewUrl].join("\n") };
  }
}

/** Never throws: a mail problem must not undo or block the security action that triggered it. */
export async function sendMfaMail(to: string, name: string, mail: MfaMail) {
  try {
    if (!(await smtpConfigured())) return false;
    const smtp = await smtpTransport();
    await smtp.transporter.sendMail({ from: smtp.from, to, ...renderMfaMail(mail, name) });
    return true;
  } catch (error) {
    logger.error({ ...errorFields(error), kind: mail.kind }, "MFA email failed");
    return false;
  }
}

/** The user's own, explicitly requested copy of freshly generated codes. Throws so the caller can say it failed. */
export async function sendRecoveryCodesMail(to: string, name: string, codes: string[]) {
  const smtp = await smtpTransport();
  await smtp.transporter.sendMail({
    from: smtp.from,
    to,
    subject: "Your SignalHub recovery codes",
    text: [
      `Hello ${name},`, "",
      "You asked us to email your one-time recovery codes. Each works once if you lose your authenticator.", "",
      ...codes, "",
      "Keep them somewhere safe, then delete this email. Anyone with these codes and your password can sign in.",
    ].join("\n"),
  });
}
