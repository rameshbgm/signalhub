/**
 * `signalhubctl setup`: the setup wizard in a terminal, for headless installs
 * (install.sh "terminal" mode, kubectl exec, CI). Same checks and rules as the
 * browser wizard, built on lib/setup/*.
 *
 * Non-interactive: --database-url URL [--database-ca-file PEM] [--public-url URL]
 *   --admin-username U --admin-name N --admin-email E --org-name O [--org-slug S]
 *   --password-stdin [--yes]
 */
import { readFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { resolveRuntimeEnv, writeRuntimeConfig } from "@/lib/setup/config-file";
import { testDatabase, type DatabaseInput } from "@/lib/setup/database-check";
import { revokeSetupToken } from "@/lib/setup/token";

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const assumeYes = process.argv.includes("--yes");
const interactive = Boolean(stdin.isTTY) && !process.argv.includes("--password-stdin");

async function ask(question: string, fallback = "") {
  if (!interactive) return fallback;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

/** Reads a line without echoing it, so passwords never appear on screen. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    };
    function onData(chunk: string) {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          cleanup();
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    }
    stdin.on("data", onData);
  });
}

async function confirm(question: string) {
  if (assumeYes) return true;
  if (!interactive) return false;
  return /^y(es)?$/i.test(await ask(`${question} (y/N)`));
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

function printChecks(checks: Array<{ status: string; message: string }>) {
  const mark = { pass: "  ok  ", warn: " warn ", fail: " FAIL " } as Record<string, string>;
  for (const check of checks) console.log(`[${mark[check.status] ?? check.status}] ${check.message}`);
}

async function databaseInput(): Promise<DatabaseInput> {
  const caFile = flag("--database-ca-file");
  const ca = caFile ? await readFile(caFile, "utf8") : undefined;
  const url = flag("--database-url") ?? await ask("PostgreSQL connection URL (leave empty to enter host, user and password)");
  if (url) return { url, ca };
  if (!interactive) throw new Error("--database-url is required when not running in a terminal");
  const host = await ask("Host");
  const port = Number(await ask("Port", "5432"));
  const database = await ask("Database name", "signalhub");
  const user = await ask("User", "signalhub");
  const password = await askHidden("Password: ");
  const ssl = await ask("Encryption: 1) verify certificate  2) encrypt, do not verify  3) off", "1");
  const sslMode = ssl === "3" ? "disable" : ssl === "2" ? "no-verify" : "verify-full";
  return { host, port, database, user, password, sslMode, ca };
}

async function configureDatabase(env: NodeJS.ProcessEnv) {
  if (env.DATABASE_URL) {
    console.log("Database: already configured.");
    return env;
  }
  console.log("\nStep 1 of 2: database (PostgreSQL 14 or newer; an empty, dedicated database is best)\n");
  for (;;) {
    const result = await testDatabase(await databaseInput());
    printChecks(result.checks);
    if (result.ok && result.url && (!result.needsConfirmation || await confirm("Use this database anyway?"))) {
      const publicUrl = flag("--public-url") ?? (env.NEXT_PUBLIC_APP_URL || await ask("Public URL people will use", "http://localhost:3301"));
      await writeRuntimeConfig({
        DATABASE_URL: result.url,
        ...(result.ca ? { DATABASE_SSL_CA: result.ca } : {}),
        ...(env.NEXT_PUBLIC_APP_URL ? {} : { NEXT_PUBLIC_APP_URL: new URL(publicUrl).origin }),
      }, env);
      return (await resolveRuntimeEnv(env)).env;
    }
    if (!interactive) throw new Error("The database check failed.");
    console.log("\nLet's try again.\n");
  }
}

async function createAdmin() {
  const { adminInputErrors, bootstrapInstance, countUsers, normalizeAdminInput, slugFromName } = await import("@/lib/setup/admin");
  if (await countUsers() > 0) {
    console.log("Administrator: already exists. (To reset a password use dist-runtime/bootstrap.mjs.)");
    return;
  }
  console.log("\nStep 2 of 2: administrator (manages your organization and the installation)\n");
  const passwordFromStdin = process.argv.includes("--password-stdin") ? await readStdin() : "";
  for (;;) {
    const organizationName = flag("--org-name") ?? await ask("Organization name");
    const input = normalizeAdminInput({
      organizationName,
      organizationSlug: flag("--org-slug") ?? await ask("Organization ID", slugFromName(organizationName)),
      name: flag("--admin-name") ?? await ask("Your name"),
      email: flag("--admin-email") ?? await ask("Email"),
      username: flag("--admin-username") ?? await ask("User ID (to sign in)", "admin"),
      password: passwordFromStdin || await askHidden("Password: "),
    });
    if (interactive && !passwordFromStdin && await askHidden("Confirm password: ") !== input.password) {
      console.log("The passwords do not match.\n");
      continue;
    }
    const errors = Object.values(adminInputErrors(input, { strict: true }));
    if (!errors.length) {
      const result = await bootstrapInstance(input, { onlyIfNoUsers: true, mustChangePassword: false });
      console.log(`\nAdministrator ${result.username} created for ${result.organization}.`);
      return;
    }
    for (const error of errors) console.log(`  - ${error}`);
    if (!interactive) throw new Error("The administrator details are not valid.");
    console.log("");
  }
}

export async function setupCli() {
  const env = await configureDatabase((await resolveRuntimeEnv()).env);
  // The database modules read DATABASE_URL when first imported, so set the
  // final environment before loading them.
  Object.assign(process.env, env);
  const { runMigrations } = await import("@/lib/migrations");
  const { migrateJobSchema } = await import("@/lib/job-schema");
  const { closeDatabase } = await import("@/lib/postgres/client");
  try {
    console.log("Installing or upgrading the database schema…");
    await runMigrations();
    await migrateJobSchema();
    await createAdmin();
    await revokeSetupToken(env);
    console.log("\nSetup complete. Restart SignalHub to leave setup mode (docker compose restart signalhub), then sign in at /login.");
  } finally {
    await closeDatabase();
  }
}
