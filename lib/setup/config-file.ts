import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Setup state that must survive container restarts lives in one JSON file in
 * SIGNALHUB_DATA_DIR. Environment variables always win, so Kubernetes and PaaS
 * deployments stay stateless and never need this file.
 */
/** Exit code the web server uses to ask dist-runtime/start.mjs to reload config. */
export const SETUP_RELOAD_EXIT_CODE = 75;

export const RUNTIME_CONFIG_KEYS = [
  "DATABASE_URL",
  "DATABASE_SSL_CA",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

export type RuntimeConfigKey = (typeof RUNTIME_CONFIG_KEYS)[number];
export type RuntimeConfig = Partial<Record<RuntimeConfigKey, string>>;

export function dataDir(env: NodeJS.ProcessEnv = process.env) {
  return path.resolve(env.SIGNALHUB_DATA_DIR || path.join(process.cwd(), "data"));
}

export function runtimeConfigPath(env: NodeJS.ProcessEnv = process.env) {
  return path.join(dataDir(env), "signalhub.json");
}

export async function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env): Promise<RuntimeConfig> {
  let raw: string;
  try {
    raw = await readFile(runtimeConfigPath(env), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const config: RuntimeConfig = {};
  for (const key of RUNTIME_CONFIG_KEYS) {
    const value = parsed[key];
    if (typeof value === "string" && value) config[key] = value;
  }
  return config;
}

/** Atomic (temp file + rename) and owner-only: the file holds the encryption key. */
export async function writeRuntimeConfig(patch: RuntimeConfig, env: NodeJS.ProcessEnv = process.env) {
  const file = runtimeConfigPath(env);
  const next = { ...(await readRuntimeConfig(env)), ...patch };
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  return next;
}

export async function removeRuntimeConfigKeys(keys: RuntimeConfigKey[], env: NodeJS.ProcessEnv = process.env) {
  const current = await readRuntimeConfig(env);
  for (const key of keys) delete current[key];
  const file = runtimeConfigPath(env);
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

/**
 * Which runtime keys the operator set in the real environment (as opposed to
 * the wizard's file). Recorded once in SIGNALHUB_ENV_KEYS before merging, so
 * child processes know which settings the wizard may change.
 */
export function environmentKeys(env: Partial<NodeJS.ProcessEnv> = process.env): RuntimeConfigKey[] {
  if (env.SIGNALHUB_ENV_KEYS !== undefined) {
    return env.SIGNALHUB_ENV_KEYS.split(",").filter(Boolean) as RuntimeConfigKey[];
  }
  return RUNTIME_CONFIG_KEYS.filter((key) => Boolean(env[key]));
}

export function setFromEnvironment(key: RuntimeConfigKey, env: Partial<NodeJS.ProcessEnv> = process.env) {
  return environmentKeys(env).includes(key);
}

/** Returns a copy of env where file values only fill keys env leaves empty. */
export function mergeIntoEnv(env: Partial<NodeJS.ProcessEnv>, config: RuntimeConfig): Partial<NodeJS.ProcessEnv> {
  const merged: Partial<NodeJS.ProcessEnv> = { ...env };
  for (const key of RUNTIME_CONFIG_KEYS) {
    if (merged[key]) continue;
    if (config[key]) merged[key] = config[key];
    else delete merged[key];
  }
  return merged;
}

/**
 * First-boot secrets: generated once and persisted, never asked for. A keyring
 * (SESSION_SIGNING_KEYS / ENCRYPTION_KEYS) counts as configured.
 */
export async function ensureGeneratedSecrets(env: Partial<NodeJS.ProcessEnv>) {
  const generated: RuntimeConfig = {};
  if (!env.SESSION_SECRET && !env.SESSION_SIGNING_KEYS) generated.SESSION_SECRET = randomBytes(48).toString("base64url");
  if (!env.ENCRYPTION_KEY && !env.ENCRYPTION_KEYS) generated.ENCRYPTION_KEY = randomBytes(48).toString("base64url");
  if (!Object.keys(generated).length) return generated;
  try {
    await writeRuntimeConfig(generated, env as NodeJS.ProcessEnv);
  } catch (error) {
    throw new Error(
      `SESSION_SECRET and ENCRYPTION_KEY are not set and ${runtimeConfigPath(env as NodeJS.ProcessEnv)} is not writable ` +
      `(${(error as Error).message}). Set them as environment variables or mount a writable volume at ${dataDir(env as NodeJS.ProcessEnv)}.`
    );
  }
  return generated;
}

/**
 * For operator commands run beside a wizard-configured server (signalhubctl,
 * bootstrap.mjs, migrate.mjs): read the saved settings into process.env.
 * Must run before anything imports lib/postgres/client.ts.
 */
export async function loadRuntimeConfigIntoEnv() {
  const keys = environmentKeys(process.env).join(",");
  Object.assign(process.env, mergeIntoEnv(process.env, await readRuntimeConfig()), { SIGNALHUB_ENV_KEYS: keys });
}

/** Environment plus config file plus any first-boot secrets, ready for a child process. */
export async function resolveRuntimeEnv(env: NodeJS.ProcessEnv = process.env) {
  const merged = { ...mergeIntoEnv(env, await readRuntimeConfig(env)), SIGNALHUB_ENV_KEYS: environmentKeys(env).join(",") } as NodeJS.ProcessEnv;
  const generated = await ensureGeneratedSecrets(merged);
  return { env: { ...merged, ...generated } as NodeJS.ProcessEnv, generated: Object.keys(generated) };
}
