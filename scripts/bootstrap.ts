import { closeDatabase } from "@/lib/postgres/client";
import { bootstrapInstance, type AdminInput } from "@/lib/setup/admin";

async function readPasswordFromStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

async function bootstrapInput(): Promise<AdminInput> {
  const values = new Map<string, string>();
  let passwordFromStdin = false;
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (key === "--password-stdin") {
      passwordFromStdin = true;
      continue;
    }
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid bootstrap argument ${key ?? ""}`);
    }
    values.set(key, value);
    index += 1;
  }
  const password = passwordFromStdin
    ? await readPasswordFromStdin()
    : values.get("--password") ?? "";
  if (!password) throw new Error("Provide the initial password with --password-stdin");

  return {
    username: values.get("--username") ?? "admin",
    password,
    name: (values.get("--name") ?? process.env.STATUS_BOOTSTRAP_NAME ?? "Instance Administrator").trim(),
    email: values.get("--email") ?? process.env.STATUS_BOOTSTRAP_EMAIL ?? "",
    organizationName: (values.get("--org-name") ?? process.env.STATUS_BOOTSTRAP_ORG_NAME ?? "Default Organization").trim(),
    organizationSlug: (values.get("--org-slug") ?? process.env.STATUS_BOOTSTRAP_ORG_SLUG ?? "default").trim(),
  };
}

async function main() {
  // The CLI deliberately resets an existing admin (break-glass recovery), so
  // it does not use the wizard's first-run-only guard.
  const result = await bootstrapInstance(await bootstrapInput(), { onlyIfNoUsers: false, mustChangePassword: true });
  console.log(`Admin ${result.username} is ready for ${result.organization} and must complete account setup at the next login.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
