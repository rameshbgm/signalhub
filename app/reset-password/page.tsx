import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/PasswordRecovery";
import { passwordMinimumLength } from "@/lib/password-policy";
import { describeResetToken } from "@/lib/password-reset";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reset password · SignalHub",
  robots: { index: false },
  // The token is in the URL: never send it onward in a Referer header.
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const account = token ? await describeResetToken(token) : null;
  return <ResetPasswordForm token={token} username={account?.username ?? null} passwordMinimum={passwordMinimumLength()} />;
}
