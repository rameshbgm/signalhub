/**
 * SignalHub supervisor: `node dist-runtime/start.mjs [--role all|web|worker] [--dev]`.
 *
 * The image's entrypoint, `npm run start:all` in a plain Node checkout, and
 * (with --dev) `npm run dev` / `npm run dev:all`. One process runs the whole
 * installation:
 *   1. merge SIGNALHUB_DATA_DIR/signalhub.json under the environment (env wins)
 *      and generate missing session/encryption secrets on first start;
 *   2. with no DATABASE_URL, start only the web server in setup mode so the
 *      operator can enter the database in the browser (/setup);
 *   3. otherwise migrate, then start web and worker, or the administrator step
 *      of the setup wizard when no user exists yet.
 * After the wizard saves, the web server signals SIGUSR2 (or exits with
 * SETUP_RELOAD_EXIT_CODE) and the supervisor reloads in place, so no container
 * restart and no restart policy is needed.
 *
 * Database work runs in a short-lived child (`--prepare`) because the database
 * client binds DATABASE_URL at import time and must not outlive a config change.
 */
import { spawn, fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir, resolveRuntimeEnv, runtimeConfigPath, SETUP_RELOAD_EXIT_CODE } from "@/lib/setup/config-file";
import { issueSetupToken, revokeSetupToken, setupTokenPath } from "@/lib/setup/token";

type Role = "all" | "web" | "worker";
type SetupMode = "db" | "admin";
type PrepareResult = { users: number; bootstrapped: boolean };

const self = fileURLToPath(import.meta.url);
const root = process.cwd();
const dev = process.argv.includes("--dev");

/**
 * Where the web server lives: next to us in the image, in .next/standalone
 * after `npm run build` in a checkout, or `next dev` in development.
 */
function webCommand(): { args: string[]; checkout: boolean } {
  if (dev) {
    const port = process.env.PORT || "3301";
    return { args: [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "-p", port], checkout: true };
  }
  const image = path.join(root, "server.js");
  if (existsSync(image)) return { args: [image], checkout: false };
  const standalone = path.join(root, ".next/standalone/server.js");
  if (existsSync(standalone)) return { args: [standalone], checkout: true };
  throw new Error("No built web server found. Run `npm run build` first (or use `npm run dev` for development).");
}

function workerCommand() {
  if (dev) return [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(root, "worker/index.ts")];
  const worker = path.join(root, "dist-runtime/worker.mjs");
  if (!existsSync(worker)) throw new Error("dist-runtime/worker.mjs not found. Run `npm run build` first.");
  return [worker];
}

function log(message: string) {
  console.log(`[signalhub] ${message}`);
}

function parseRole(): Role {
  const index = process.argv.indexOf("--role");
  const value = index === -1 ? "all" : process.argv[index + 1];
  if (value === "all" || value === "web" || value === "worker") return value;
  throw new Error(`Unknown --role ${value}; use all, web or worker`);
}

async function resolveEnvironment(checkout: boolean) {
  const { env, generated } = await resolveRuntimeEnv();
  if (generated.length) {
    log(`Generated ${generated.join(" and ")} in ${runtimeConfigPath(env)}. Back this file up: without ENCRYPTION_KEY stored credentials cannot be decrypted.`);
  }
  return {
    ...env,
    // Children may change directory (the standalone server does), so pin
    // the data directory and tell them who to signal for a reload.
    SIGNALHUB_DATA_DIR: dataDir(env),
    SIGNALHUB_SUPERVISOR_PID: String(process.pid),
    // A checkout listens on localhost behind a reverse proxy unless told
    // otherwise. Nothing probes the worker's health port outside containers,
    // so a free port avoids clashes between several instances on one machine.
    ...(checkout ? {
      // The image sets NODE_ENV; a checkout gets it from the mode it runs in.
      NODE_ENV: env.NODE_ENV || (dev ? "development" : "production"),
      PORT: env.PORT || "3301",
      HOSTNAME: env.SIGNALHUB_HOST || "127.0.0.1",
      WORKER_HEALTH_PORT: env.WORKER_HEALTH_PORT || "0",
    } : {}),
  } as NodeJS.ProcessEnv;
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

/** Runs inside the `--prepare` child (or a Kubernetes initContainer) with the final environment. */
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
      log("Created the first administrator from STATUS_BOOTSTRAP_* variables.");
    }
    process.send?.({ users, bootstrapped } satisfies PrepareResult);
  } finally {
    await closeDatabase();
  }
}

function banner(token: string, mode: SetupMode, env: NodeJS.ProcessEnv, checkout: boolean) {
  const url = env.NEXT_PUBLIC_APP_URL
    ? `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/setup`
    : checkout
      ? `http://localhost:${env.PORT}/setup`
      // Inside a container the published host port is unknown.
      : "/setup on this server (Docker Compose default: http://localhost:3301/setup)";
  const lines = [
    mode === "db" ? "SignalHub needs a database. Finish setup in your browser:" : "Create the first administrator in your browser:",
    `  ${url}`,
    "SETUP TOKEN:",
    `  ${token}`,
    `(also in ${setupTokenPath(env)}; new token: signalhubctl setup --new-token)`,
  ];
  const width = Math.min(Math.max(...lines.map((line) => line.length)) + 4, 72);
  const rule = "=".repeat(width);
  console.log([rule, ...lines.map((line) => `  ${line}`), rule].join("\n"));
}

let current: ChildProcess[] = [];
let stopping = false;
let reloadRequested = false;

function stopAll(signal: NodeJS.Signals) {
  for (const child of current) if (child.exitCode === null && child.signalCode === null) child.kill(signal);
}

async function supervise(role: Role) {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      stopping = true;
      log(`${signal} received, stopping`);
      stopAll(signal);
    });
  }
  if (process.platform !== "win32") {
    process.on("SIGUSR2", () => {
      reloadRequested = true;
      stopAll("SIGTERM");
    });
  }
  const web = role === "worker" ? null : webCommand();
  const checkout = web?.checkout ?? dev;
  const worker = role === "web" ? null : workerCommand();

  const startChildren = (roles: { web: boolean; worker: boolean }, env: NodeJS.ProcessEnv) => {
    const children: ChildProcess[] = [];
    if (roles.web && web) children.push(spawn(process.execPath, web.args, { env, stdio: "inherit" }));
    if (roles.worker && worker) children.push(spawn(process.execPath, worker, { env, stdio: "inherit" }));
    return children;
  };

  while (!stopping) {
    reloadRequested = false;
    const env = await resolveEnvironment(checkout);
    let setupMode: SetupMode | null = null;

    if (!env.DATABASE_URL) {
      if (role === "worker") throw new Error("The worker needs DATABASE_URL. Finish setup on a web instance first.");
      setupMode = "db";
    } else {
      const { users } = await prepareDatabase(env);
      if (users === 0 && role !== "worker") setupMode = "admin";
    }

    if (setupMode) {
      const token = await issueSetupToken(env).catch(() => randomBytes(24).toString("base64url"));
      banner(token, setupMode, env, checkout);
      current = startChildren({ web: true, worker: false }, {
        ...env,
        SIGNALHUB_SETUP_MODE: setupMode,
        SIGNALHUB_SETUP_TOKEN: token,
        // Setup mode has no worker; readiness is reported by the setup gate.
        REQUIRE_WORKER: "false",
      });
    } else {
      await revokeSetupToken(env).catch(() => undefined);
      current = startChildren({ web: role !== "worker", worker: role !== "web" }, env);
    }

    // Any child exiting ends this round: the platform restarts the container
    // rather than leaving web up without its worker (or vice versa).
    const code = await Promise.race(current.map(waitForExit));
    if (!stopping) stopAll("SIGTERM");
    await Promise.all(current.map(waitForExit));
    if (stopping) return 0;
    if (reloadRequested || code === SETUP_RELOAD_EXIT_CODE) {
      log("Configuration changed, reloading");
      continue;
    }
    return code || 1;
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
