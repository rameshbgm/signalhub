"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LostDevicePanel } from "@/components/auth/LostDevicePanel";
import { LoginSecurity } from "@/components/auth/LoginSecurity";
import { MfaEnrollment } from "@/components/auth/MfaEnrollment";
import { mfaCall } from "@/components/auth/mfa-client";
import { QuickLogin } from "@/components/auth/QuickLogin";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Activity, ArrowRight, KeyRound, LockKeyhole, UserRound } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import styles from "./login.module.css";

type Step = "password" | "code" | "enroll";
type LoginBody = { mustChangePassword?: boolean; mustCompleteProfile?: boolean; redirectTo?: string };

export function UnifiedLogin({ returnTo }: { returnTo: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("password");
  const [useRecovery, setUseRecovery] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [lostDevice, setLostDevice] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [connections, setConnections] = useState<Array<{ name: string; startUrl: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWithTimeout("/api/auth/connections")
      .then((response) => response.ok ? response.json() : { connections: [] })
      .then((body) => setConnections(body.connections ?? []))
      .catch(() => setConnections([]));
  }, []);

  function enter(body: LoginBody) {
    router.push(body.mustChangePassword || body.mustCompleteProfile ? "/organization/change-password" : body.redirectTo ?? returnTo ?? "/organization");
    router.refresh();
  }

  function backToPassword(message: string | null = null) {
    setStep("password");
    setCode("");
    setUseRecovery(false);
    setLostDevice(false);
    setError(message);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (step === "code") {
        const result = await mfaCall<LoginBody>("/api/auth/login/mfa", {
          ...(useRecovery ? { recoveryCode: code } : { code }), trustDevice,
        });
        if (result.ok) return enter(result.body);
        if (result.code === "MFA_CHALLENGE_EXPIRED") return backToPassword(result.error);
        setError(result.error);
        setCode("");
        return;
      }
      const response = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 202) {
        if (body.mfa?.step === "enroll") {
          const info = await mfaCall<{ emailAvailable: boolean }>("/api/auth/mfa");
          setEmailAvailable(info.ok && info.body.emailAvailable);
        }
        setStep(body.mfa?.step === "enroll" ? "enroll" : "code");
        return;
      }
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : body.error?.message ?? "Login failed");
        return;
      }
      enter(body);
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`${styles.page} bg-surface text-ink selection:bg-primary-soft selection:text-primary-ink lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
      <main className={`${styles.main} flex min-h-svh min-w-0 flex-col px-6 sm:px-12 lg:order-2 lg:min-h-0`}>
        <Link href="/" className="flex w-fit items-center gap-2.5 rounded-control text-base font-bold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
          <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-card bg-primary text-white">
            <Activity size={19} strokeWidth={2.25} />
          </span>
          SignalHub
        </Link>

        <div className={`${styles.content} m-auto w-full ${step === "enroll" ? "max-w-lg" : "max-w-[420px]"}`}>
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{step === "enroll" ? "Set up two-step verification" : step === "code" ? "Enter your code" : "Welcome back"}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            {step === "enroll"
              ? "Your organization requires a code from an authenticator app. Set it up now to continue."
              : step === "code"
                ? useRecovery ? "Enter one of your one-time recovery codes." : "Open your authenticator app and type the 6-digit code."
                : "Sign in to your SignalHub workspace."}
          </p>

          {step === "enroll" && (
            <div className="mt-8 space-y-4">
              <MfaEnrollment emailAvailable={emailAvailable} continueLabel="Continue" onFinished={(body) => enter((body ?? {}) as LoginBody)} />
              <Button type="button" variant="link" onClick={() => backToPassword()}>Back to sign in</Button>
            </div>
          )}

          {step !== "enroll" && (
            <form onSubmit={submit} className={styles.passwordForm}>
              {error && <Alert tone="danger">{error}</Alert>}
              {step === "password" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-username">User ID</Label>
                    <div className="relative">
                      <UserRound aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
                      <Input id="login-username" suppressHydrationWarning value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Enter your User ID" required className="h-11 pl-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <Label htmlFor="login-password">Password</Label>
                      <Link href="/forgot-password" className="text-xs font-medium text-primary-ink underline-offset-4 hover:underline">Forgot password?</Link>
                    </div>
                    <div className="relative">
                      <KeyRound aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
                      <Input id="login-password" suppressHydrationWarning value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Enter your password" required className="h-11 pl-10" />
                    </div>
                  </div>
                </>
              )}
              {step === "code" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-code">{useRecovery ? "Recovery code" : "Authenticator code"}</Label>
                    <Input id="login-code" suppressHydrationWarning value={code} autoFocus
                      onChange={(event) => setCode(useRecovery ? event.target.value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 14) : event.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode={useRecovery ? "text" : "numeric"} autoComplete="one-time-code"
                      placeholder={useRecovery ? "XXXX-XXXX-XXXX" : "6-digit code"} required className="h-10" />
                    {!useRecovery && <p className="text-xs leading-5 text-ink-dim">Make sure your phone&rsquo;s time is set automatically.</p>}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
                    Trust this device for 30 days
                  </label>
                </>
              )}
              <Button type="submit" loading={loading} size="lg" className="w-full">
                {step === "code" ? "Verify and sign in" : "Sign in"}
                {!loading && <ArrowRight aria-hidden="true" size={16} />}
              </Button>
              {step === "code" && (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button type="button" variant="link" onClick={() => { setUseRecovery((value) => !value); setCode(""); setError(null); }}>
                      {useRecovery ? "Use my authenticator app" : "Use a recovery code instead"}
                    </Button>
                    <Button type="button" variant="link" onClick={() => setLostDevice((value) => !value)}>Can&rsquo;t access your device?</Button>
                  </div>
                  <Button type="button" variant="link" onClick={() => backToPassword()}>Back</Button>
                </div>
              )}
            </form>
          )}

          {step === "code" && lostDevice && (
            <div className="mt-4">
              <LostDevicePanel username={username} password={password} onUseRecovery={() => { setUseRecovery(true); setCode(""); setLostDevice(false); }} />
            </div>
          )}

          {(process.env.NEXT_PUBLIC_OIDC_ENABLED === "true" || connections.length > 0) && (
            <div className="mt-4 space-y-2">
              {process.env.NEXT_PUBLIC_OIDC_ENABLED === "true" && <Link href="/api/auth/oidc/start" prefetch={false} className={ssoLinkClass}>Sign in with OpenID Connect</Link>}
              {connections.map((connection) => <Link key={connection.startUrl} href={connection.startUrl} prefetch={false} className={ssoLinkClass}>Sign in with {connection.name}</Link>)}
            </div>
          )}
          {step === "password" && <QuickLogin />}
        </div>
        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-dim">
          <LockKeyhole aria-hidden="true" size={13} /> Access is managed by your organization.
        </p>
      </main>
      <LoginSecurity />
    </div>
  );
}

const ssoLinkClass = buttonVariants({ variant: "secondary", size: "lg", className: "w-full" });
