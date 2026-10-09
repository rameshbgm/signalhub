import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/PasswordRecovery";

export const metadata: Metadata = { title: "Forgot password · SignalHub", robots: { index: false } };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
