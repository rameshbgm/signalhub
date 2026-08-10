import { hashPassword } from "@/lib/auth";
import { closeDatabase, database } from "@/lib/postgres/client";
import { canonicalizeEmail, canonicalizeUsername, usernameError } from "@/lib/identity";

type BootstrapInput = {
  username: string;
  password: string;
  name: string;
  email: string;
  organizationName: string;
  organizationSlug: string;
};

async function readPasswordFromStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trimEnd();
}

async function bootstrapInput(): Promise<BootstrapInput> {
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
    username: canonicalizeUsername(values.get("--username") ?? "admin"),
    password,
    name: (values.get("--name") ?? process.env.STATUS_BOOTSTRAP_NAME ?? "Instance Administrator").trim(),
    email: canonicalizeEmail(values.get("--email") ?? process.env.STATUS_BOOTSTRAP_EMAIL ?? ""),
    organizationName: (values.get("--org-name") ?? process.env.STATUS_BOOTSTRAP_ORG_NAME ?? "Default Organization").trim(),
    organizationSlug: (values.get("--org-slug") ?? process.env.STATUS_BOOTSTRAP_ORG_SLUG ?? "default").trim(),
  };
}

async function main() {
  const input = await bootstrapInput();
  const invalidUsername = usernameError(input.username);
  if (invalidUsername) throw new Error(invalidUsername);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.organizationSlug)) {
    throw new Error("Organization slug must contain lowercase letters, numbers, and single hyphens");
  }
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const result = await database.transaction().execute(async (transaction) => {
    const organization = await transaction
      .insertInto("organizations")
      .values({
        name: input.organizationName,
        slug: input.organizationSlug,
        contactEmail: input.email || null,
        suspended: false,
        status: "ACTIVE",
        statusReason: null,
        statusChangedAt: now,
        statusChangedBy: null,
        updatedAt: now,
      })
      .onConflict((conflict) => conflict.column("slug").doUpdateSet({
        name: input.organizationName,
        contactEmail: input.email || null,
        suspended: false,
        status: "ACTIVE",
        statusReason: null,
        updatedAt: now,
      }))
      .returningAll()
      .executeTakeFirstOrThrow();

    const user = await transaction
      .insertInto("users")
      .values({
        username: input.username,
        canonicalUsername: input.username,
        email: input.email,
        canonicalEmail: input.email,
        name: input.name,
        passwordHash,
        disabled: false,
        mustChangePassword: true,
        mustCompleteProfile: !input.email,
        mfaRequired: false,
        twoFactorEnabled: false,
        oidcIssuer: null,
        oidcSubject: null,
        totpSecretCiphertext: null,
        pendingTotpSecretCiphertext: null,
        recoveryCodeHashes: [],
        mfaEnrolledAt: null,
        updatedAt: now,
      })
      .onConflict((conflict) => conflict.column("canonicalUsername").doUpdateSet({
        email: input.email,
        canonicalEmail: input.email,
        name: input.name,
        passwordHash,
        disabled: false,
        mustChangePassword: true,
        mustCompleteProfile: !input.email,
        updatedAt: now,
      }))
      .returningAll()
      .executeTakeFirstOrThrow();

    await transaction
      .insertInto("memberships")
      .values({
        orgId: organization.id,
        userId: user.id,
        role: "ADMIN",
        status: "ACTIVE",
        pageIds: null,
        invitationExpiresAt: null,
        invitationTokenHash: null,
        activatedAt: now,
      })
      .onConflict((conflict) => conflict.columns(["orgId", "userId"]).doUpdateSet({
        role: "ADMIN",
        status: "ACTIVE",
        pageIds: null,
        invitationExpiresAt: null,
        invitationTokenHash: null,
        activatedAt: now,
      }))
      .execute();
    await transaction.deleteFrom("authSessions").where("userId", "=", user.id).execute();
    return { username: user.username, organization: organization.name };
  });

  console.log(`Admin ${result.username} is ready for ${result.organization} and must complete account setup at the next login.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
