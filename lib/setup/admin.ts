import { sql } from "kysely";
import { hashPassword } from "@/lib/auth";
import { canonicalizeEmail, canonicalizeUsername, usernameError } from "@/lib/identity";
import { newPasswordError } from "@/lib/password-policy";
import { database } from "@/lib/postgres/client";

export type AdminInput = {
  username: string;
  password: string;
  name: string;
  email: string;
  organizationName: string;
  organizationSlug: string;
};

export type AdminField = keyof AdminInput;

export class SetupAlreadyCompleteError extends Error {
  readonly code = "SETUP_ALREADY_COMPLETE";
  constructor() {
    super("An administrator already exists. Sign in instead.");
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugFromName(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "default";
}

export function normalizeAdminInput(input: AdminInput): AdminInput {
  return {
    username: canonicalizeUsername(input.username),
    password: input.password,
    name: input.name.trim(),
    email: canonicalizeEmail(input.email),
    organizationName: input.organizationName.trim(),
    organizationSlug: input.organizationSlug.trim().toLowerCase(),
  };
}

/**
 * Field-level validation shared by the setup wizard and the CLI. `strict`
 * (wizard) also enforces the password policy and a contact email, because the
 * person is choosing their real credentials rather than a temporary one.
 */
export function adminInputErrors(input: AdminInput, { strict }: { strict: boolean }) {
  const errors: Partial<Record<AdminField, string>> = {};
  const username = usernameError(input.username);
  if (username) errors.username = username;
  if (!input.name) errors.name = "Enter your name";
  if (!input.organizationName) errors.organizationName = "Enter the organization name";
  if (!SLUG.test(input.organizationSlug)) {
    errors.organizationSlug = "Use lowercase letters, numbers and single hyphens";
  }
  if (strict) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = "Enter a valid email address";
    const password = newPasswordError(input.password, [input.username, input.name, ...input.name.split(/\s+/), input.email.split("@")[0] ?? ""]);
    if (password) errors.password = password;
  } else if (!input.password) {
    errors.password = "Provide the initial password";
  }
  return errors;
}

export async function countUsers() {
  const row = await database.selectFrom("users").select((eb) => eb.fn.countAll<string>().as("count")).executeTakeFirstOrThrow();
  return Number(row.count);
}

/**
 * Creates (or, for the CLI, resets) the first organization and its Admin.
 * Admin is also the installation (platform) administrator.
 *
 * `onlyIfNoUsers` is the setup-wizard mode: it serializes concurrent attempts
 * with an advisory lock and refuses once any user exists, so the unauthenticated
 * setup flow can never add a second admin or take over an installed instance.
 */
export async function bootstrapInstance(
  rawInput: AdminInput,
  options: { onlyIfNoUsers: boolean; mustChangePassword: boolean }
) {
  const input = normalizeAdminInput(rawInput);
  const errors = adminInputErrors(input, { strict: options.onlyIfNoUsers });
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  return database.transaction().execute(async (transaction) => {
    if (options.onlyIfNoUsers) {
      await sql`select pg_advisory_xact_lock(hashtext('signalhub-first-run-setup'))`.execute(transaction);
      const existing = await transaction.selectFrom("users").select("id").limit(1).executeTakeFirst();
      if (existing) throw new SetupAlreadyCompleteError();
    }

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
        mustChangePassword: options.mustChangePassword,
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
        mustChangePassword: options.mustChangePassword,
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
}
