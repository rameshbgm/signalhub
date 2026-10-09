/**
 * Container entrypoint (`node dist-runtime/start.mjs [--role all|web|worker]`).
 *
 * One process supervises the whole installation so a single container is a
 * complete deployment:
 *   1. merge SIGNALHUB_DATA_DIR/signalhub.json under the environment (env wins)
 *      and generate missing session/encryption secrets on first boot;
 *   2. with no DATABASE_URL, start only the web server in setup mode so the
 *      operator can enter the database in the browser (/setup);
 *   3. otherwise migrate, then start web and worker, or the admin step of the
 *      setup wizard when no user exists yet.
 * The web server exits with SETUP_RELOAD_EXIT_CODE after the wizard saves; the
 * supervisor then re-reads the configuration in place, so no container restart
 * (and no restart policy) is needed.
 *
 * Database work runs in a short-lived child (`--prepare`) because the database
 * client binds DATABASE_URL at import time and must not outlive a config change.
 */
import { spawn, fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRuntimeEnv, runtimeConfigPath, SETUP_RELOAD_EXIT_CODE } from "@/lib/setup/config-file";
import { issueSetupToken, revokeSetupToken, setupTokenPath } from "@/lib/setup/token";

type Role = "all" | "web" | "worker";
type PrepareResult = { users: number; bootstrapped: boolean };

const self = fileURLToPath(import.meta.url);
const root = process.cwd();
const serverEntry = path.join(root, "server.js");
const workerEntry = path.join(root, "dist-runtime", "worker.mjs");

function log(message: string) {
  console.log(`[signalhub] ${message}`);
}

function parseRole(): Role {
  const index = process.argv.indexOf("--role");
  const value = index === -1 ? "all" : process.argv[index + 1];
  if (value === "all" || value === "web" || value === "worker") return value;
  throw new Error(`Unknown --role ${value}; use all, web or worker`);
}

async function resolveEnvironment() {
  const { env, generated } = await resolveRuntimeEnv();
  if (generated.length) {
    log(`Generated ${generated.join(" and ")} in ${runtimeConfigPath(env)}. Back this file up: without ENCRYPTION_KEY stored credentials cannot be decrypted.`);
  }
  return env;
}

function waitForExit(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.exitCode ?? 1);
  }
  return new Promise<number>((resolve) => {
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function prepareDatabase(env: NodeJS.ProcessEnv) {
  const child = fork(self, ["--prepare"], { env, stdio: "inherit" });
  let result: PrepareResult | null = null;
  child.on("message", (message) => { result = message as PrepareResult; });
  const code = await waitForExit(child);
  if (code !== 0 || !result) throw new Error("Database preparation failed; see the error above.");
  return result as PrepareResult;
}

/** Runs inside the `--prepare` child with the final environment already set. */
async function prepare() {
  const { runMigrations } = await import("@/lib/migrations");
  const { migrateJobSchema } = await import("@/lib/job-schema");
  const { bootstrapInstance, countUsers } = await import("@/lib/setup/admin");
  const { closeDatabase } = await import("@/lib/postgres/client");
  try {
    await runMigrations();
    await migrateJobSchema();
    let users = await countUsers();
    let bootstrapped = false;
    const password = process.env.STATUS_BOOTSTRAP_PASSWORD;
    if (users === 0 && password) {
      // Headless first admin for Kubernetes/PaaS. Only on an empty user table,
      // so a password left in the environment never resets a later change.
      await bootstrapInstance({
        username: process.env.STATUS_BOOTSTRAP_USERNAME ?? "admin",
        password,
        name: process.env.STATUS_BOOTSTRAP_NAME ?? "Instance Administrator",
        email: process.env.STATUS_BOOTSTRAP_EMAIL ?? "",
        organizationName: process.env.STATUS_BOOTSTRAP_ORG_NAME ?? "Default Organization",
        organizationSlug: process.env.STATUS_BOOTSTRAP_ORG_SLUG ?? "default",
      }, { onlyIfNoUsers: false, mustChangePassword: true });
      users = await countUsers();
      bootstrapped = true;
    }
    process.send?.({ users, bootstrapped } satisfies PrepareResult);
  } finally {
    await closeDatabase();
  }
}

function banner(token: string, mode: "db" | "admin", env: NodeJS.ProcessEnv) {
  // Inside a container the published host port is unknown, so without a
  // configured public URL point at the path and the usual local address.
  const url = env.NEXT_PUBLIC_APP_URL
    ? `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/setup`
    : "/setup on this server (Docker Compose default: http://localhost:3301/setup)";
  const lines = [
    mode === "db" ? "SignalHub needs a database. Finish setup in your browser:" : "Create the first administrator in your browser:",
    `  ${url}`,
    "SETUP TOKEN:",
    `  ${token}`,
    `(also in ${setupTokenPath(env)})`,
  ];
  const width = Math.max(...lines.map((line) => line.length)) + 4;
  const rule = "=".repeat(width);
  console.log([rule, ...lines.map((line) => `  ${line}`), rule].join("\n"));
}

function startChildren(role: Role, env: NodeJS.ProcessEnv) {
  const children: ChildProcess[] = [];
  if (role !== "worker") children.push(spawn(process.execPath, [serverEntry], { env, stdio: "inherit" }));
  if (role !== "web") children.push(spawn(process.execPath, [workerEntry], { env, stdio: "inherit" }));
  return children;
}

let current: ChildProcess[] = [];
let stopping = false;

function stopAll(signal: NodeJS.Signals) {
  for (const child of current) if (child.exitCode === null) child.kill(signal);
}

async function supervise(role: Role) {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      stopping = true;
      log(`${signal} received, stopping`);
      stopAll(signal);
    });
  }
  if (!existsSync(serverEntry) && role !== "worker") {
    throw new Error(`${serverEntry} not found. start.mjs runs from the built image (npm run build) directory.`);
  }

  while (!stopping) {
    const env = await resolveEnvironment();
    let setupMode: "db" | "admin" | null = null;

    if (!env.DATABASE_URL) {
      if (role === "worker") throw new Error("The worker needs DATABASE_URL. Finish setup on a web instance first.");
      setupMode = "db";
    } else {
      const { users, bootstrapped } = await prepareDatabase(env);
      if (bootstrapped) log("Created the first administrator from STATUS_BOOTSTRAP_* variables.");
      if (users === 0 && role !== "worker") setupMode = "admin";
    }

    if (setupMode) {
      const token = await issueSetupToken(env).catch(() => randomBytes(24).toString("base64url"));
      banner(token, setupMode, env);
      const setupEnv = {
        ...env,
        SIGNALHUB_SETUP_MODE: setupMode,
        SIGNALHUB_SETUP_TOKEN: token,
        // Setup mode has no worker; readiness is reported by the setup gate.
        REQUIRE_WORKER: "false",
      };
      current = startChildren("web", setupEnv);
      const code = await waitForExit(current[0]!);
      if (stopping) return 0;
      if (code === SETUP_RELOAD_EXIT_CODE) {
        log("Configuration saved, reloading");
        continue;
      }
      return code || 1;
    }

    await revokeSetupToken(env).catch(() => undefined);
    current = startChildren(role, env);
    // Any child exiting ends the installation: the platform restarts the
    // container rather than leaving web up without its worker (or vice versa).
    const code = await Promise.race(current.map(waitForExit));
    if (!stopping) stopAll("SIGTERM");
    await Promise.all(current.map(waitForExit));
    if (code === SETUP_RELOAD_EXIT_CODE && !stopping) continue;
    return stopping ? 0 : code || 1;
  }
  return 0;
}

const main = process.argv.includes("--prepare") ? prepare().then(() => 0) : supervise(parseRole());

main
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error(`[signalhub] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
