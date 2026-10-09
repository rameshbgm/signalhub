import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Setup state that must survive container restarts lives in one JSON file in
 * SIGNALHUB_DATA_DIR. Environment variables always win, so Kubernetes and PaaS
 * deployments stay stateless and never need this file.
 */
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

/** Returns a copy of env where file values only fill keys env leaves empty. */
export function mergeIntoEnv(env: Partial<NodeJS.ProcessEnv>, config: RuntimeConfig): Partial<NodeJS.ProcessEnv> {
  const merged: Partial<NodeJS.ProcessEnv> = { ...env };
  for (const key of RUNTIME_CONFIG_KEYS) {
    if (!merged[key] && config[key]) merged[key] = config[key];
  }
  return merged;
}
