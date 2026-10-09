"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Activity, CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fetchWithTimeout } from "@/lib/client-fetch";

function Shell({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-wash px-6 py-8 text-ink sm:px-12">
      <Link href="/" className="flex w-fit items-center gap-2.5 rounded-control text-base font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
        <span aria-hidden="true" className="inline-flex items-center text-primary"><Activity size={18} strokeWidth={2.25} /></span>
        SignalHub
      </Link>
      <main className="m-auto w-full max-w-sm animate-rise py-12">
        <h1 className="text-3xl font-bold tracking-[-0.025em]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{description}</p>
        <div className="mt-8">{children}</div>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-primary-ink underline-offset-4 hover:underline">Back to sign in</Link>
        </p>
      </main>
    </div>
  );
}

const OPERATOR_HELP = (
  <div className="mt-4 rounded-control bg-sunken px-4 py-3 text-xs leading-6 text-ink-soft">
    <p className="font-semibold text-ink">No email? Ask whoever runs this server</p>
    <p>The person who runs this SignalHub server can set a temporary password for you:</p>
    <p className="mt-1"><code className="font-mono">signalhubctl reset-password --username YOUR_USER_ID</code></p>
  </div>
);

export function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ emailAvailable: boolean } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error?.message ?? "Could not send the reset email.");
        return;
      }
      setSent({ emailAvailable: Boolean(body.emailAvailable) });
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Shell
        title={sent.emailAvailable ? "Check your email" : "Email is not set up"}
        description={sent.emailAvailable
          ? "If an account matches, a link to choose a new password is on its way. It works for 30 minutes."
          : "This installation cannot send email yet, so reset links are not available."}
      >
        {sent.emailAvailable
          ? <Alert tone="ok">Didn&apos;t get it? Check spam, then try again in a few minutes.</Alert>
          : OPERATOR_HELP}
      </Shell>
    );
  }

  return (
    <Shell title="Forgot your password?" description="Enter your User ID or email address and we'll email you a link to choose a new password.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="User ID or email" htmlFor="forgot-identifier" error={error}>
          <Input id="forgot-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required className="h-10" autoFocus />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">Send reset link</Button>
      </form>
      {OPERATOR_HELP}
    </Shell>
  );
}

export function ResetPasswordForm({ token, username, passwordMinimum }: { token: string; username: string | null; passwordMinimum: number }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!username) {
    return (
      <Shell title="This link has expired" description="Reset links work once and only for 30 minutes.">
        <Link href="/forgot-password" className={buttonVariants({ size: "lg", className: "w-full" })}>Request a new link</Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password changed" description="You were signed out everywhere. Sign in with your new password.">
        <div className="flex justify-center"><CheckCircle2 aria-hidden size={36} className="text-ok" /></div>
        <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-6 w-full" })}>Sign in</Link>
      </Shell>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const response = await fetchWithTimeout("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setDone(true);
      else setError(body.error?.message ?? "Could not change the password.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell title="Choose a new password" description={<>For the account <span className="font-semibold text-ink">{username}</span>.</>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" htmlFor="reset-password" hint={`At least ${passwordMinimum} characters. Must not contain your name, User ID or email.`}>
          <Input id="reset-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required className="h-10" autoFocus />
        </Field>
        <Field label="Confirm new password" htmlFor="reset-confirm" error={error}>
          <Input id="reset-confirm" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required className="h-10" />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">Change password</Button>
      </form>
    </Shell>
  );
}
