export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelemetry } = await import("@/lib/telemetry");
    await startTelemetry("signalhub-web");
    // Setup mode has no database yet; the environment alone decides there.
    if (!process.env.SIGNALHUB_SETUP_MODE) {
      const { startSettingsRefresh } = await import("@/lib/settings/store");
      startSettingsRefresh();
    }
  }
}
