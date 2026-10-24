import { cookies } from "next/headers";
import { SetupUnlock } from "@/components/setup/SetupUnlock";
import { SETUP_COOKIE, validSetupToken } from "@/lib/setup/token";
import type { Metadata } from "next";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { passwordMinimumLength } from "@/lib/password-policy";
import { currentSetupMode } from "@/lib/setup/http";

// Setup mode is a runtime state; never prerender this page at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set up SignalHub", robots: { index: false } };

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const mode = currentSetupMode();
  // After setup this page stays reachable and simply says so: the wizard may
  // re-render it while the server leaves setup mode.
  if (!mode) {
    return <SetupWizard initialMode="complete" bundledDatabase={false} defaultAppUrl="" passwordMinimum={passwordMinimumLength()} />;
  }
  if (!validSetupToken((await cookies()).get(SETUP_COOKIE)?.value)) {
    return <SetupUnlock invalid={(await searchParams).error === "token"} />;
  }
  return (
    <SetupWizard
      initialMode={mode}
      bundledDatabase={Boolean(process.env.SIGNALHUB_BUNDLED_DATABASE_URL)}
      defaultAppUrl={process.env.NEXT_PUBLIC_APP_URL || ""}
      passwordMinimum={passwordMinimumLength()}
    />
  );
}
