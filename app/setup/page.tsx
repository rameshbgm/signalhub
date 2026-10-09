import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { passwordMinimumLength } from "@/lib/password-policy";
import { currentSetupMode } from "@/lib/setup/http";
import { currentSetupToken, SETUP_COOKIE, setupCookieValid } from "@/lib/setup/token";

// Setup mode is a runtime state; never prerender this page at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set up SignalHub", robots: { index: false } };

export default async function SetupPage() {
  const mode = currentSetupMode();
  // After setup this page stays reachable and simply says so: the wizard may
  // re-render it while the server leaves setup mode.
  if (!mode) {
    return <SetupWizard initialMode="complete" initiallyUnlocked bundledDatabase={false} defaultAppUrl="" passwordMinimum={passwordMinimumLength()} />;
  }
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return (
    <SetupWizard
      initialMode={mode}
      initiallyUnlocked={setupCookieValid(cookieStore.get(SETUP_COOKIE)?.value, currentSetupToken())}
      bundledDatabase={Boolean(process.env.SIGNALHUB_BUNDLED_DATABASE_URL)}
      defaultAppUrl={process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`}
      passwordMinimum={passwordMinimumLength()}
    />
  );
}
