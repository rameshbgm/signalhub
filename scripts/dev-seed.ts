import { randomBytes } from "node:crypto";

const DEVELOPMENT_MODES = new Set(["development", "test"]);

type SeedEnvironment = {
  NODE_ENV?: string;
  ALLOW_DEV_SEED?: string;
};

export function assertDevelopmentSeedEnabled(
  seedName: string,
  environment: SeedEnvironment = process.env
) {
  const runtimeMode = environment.NODE_ENV;
  if (!runtimeMode || !DEVELOPMENT_MODES.has(runtimeMode)) {
    throw new Error(
      `${seedName} is development/test-only and cannot run with NODE_ENV=${runtimeMode ?? "unset"}`
    );
  }
  if (environment.ALLOW_DEV_SEED !== "true") {
    throw new Error(
      `${seedName} is opt-in. Set ALLOW_DEV_SEED=true for this command after confirming the database is non-production.`
    );
  }
}

export function generateDevelopmentPassword() {
  return `${randomBytes(18).toString("base64url")}!Aa1`;
}

export function printGeneratedSecrets(
  seedName: string,
  credentials: Array<{ label: string; value: string }>
) {
  console.log(`\n${seedName} generated credentials (shown once):`);
  for (const credential of credentials) {
    console.log(`  ${credential.label}: ${credential.value}`);
  }
  console.log("Store these values securely for the current development run; rerunning the seed rotates them.");
}
