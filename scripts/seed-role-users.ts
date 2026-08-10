import { hashPassword } from "@/lib/auth";
import { DEVELOPMENT_ACCOUNTS } from "@/lib/dev-accounts";
import { canonicalizeEmail, canonicalizeUsername } from "@/lib/identity";
import { newPasswordError } from "@/lib/password-policy";
import { assertDevelopmentSeedEnabled } from "@/scripts/dev-seed";
import { pathToFileURL } from "node:url";
import { closeDatabase, database } from "@/lib/postgres/client";

export async function seedDevelopmentRoleUsers(input: {
  password?: string;
} = {}) {
  assertDevelopmentSeedEnabled("The role-account seed");
  const password = input.password ?? process.env.DEV_ROLE_PASSWORD ?? "";
  const passwordError = newPasswordError(password);
  if (passwordError) {
    throw new Error(`DEV_ROLE_PASSWORD: ${passwordError}`);
  }
  const passwordHash = await hashPassword(password);
  const now = new Date();

  await database.transaction().execute(async (transaction) => {
    const existingDevelopmentOrganization =
      (await transaction.selectFrom("organizations").select("id").where("slug", "=", "acme").executeTakeFirst()) ??
      (await transaction.selectFrom("organizations").select("id").where("slug", "=", "default").executeTakeFirst());
    const organization = existingDevelopmentOrganization
      ? await transaction
          .updateTable("organizations")
          .set({
            name: "Acme Corporation",
            slug: "acme",
            contactEmail: "admin@status.test",
            suspended: false,
            status: "ACTIVE",
            statusReason: null,
            updatedAt: now,
          })
          .where("id", "=", existingDevelopmentOrganization.id)
          .returningAll()
          .executeTakeFirstOrThrow()
      : await transaction
          .insertInto("organizations")
          .values({
            name: "Acme Corporation",
            slug: "acme",
            contactEmail: "admin@status.test",
            suspended: false,
            status: "ACTIVE",
            statusReason: null,
            statusChangedAt: now,
            statusChangedBy: null,
            updatedAt: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

    for (const account of DEVELOPMENT_ACCOUNTS) {
      const canonicalEmail = canonicalizeEmail(account.email);
      const canonicalUsername = canonicalizeUsername(account.username);
      const user = await transaction
        .insertInto("users")
        .values({
          username: canonicalUsername,
          canonicalUsername,
          email: account.email,
          canonicalEmail,
          name: account.name,
          passwordHash,
          twoFactorEnabled: false,
          disabled: false,
          mustChangePassword: false,
          mustCompleteProfile: false,
          mfaRequired: false,
          totpSecretCiphertext: null,
          pendingTotpSecretCiphertext: null,
          recoveryCodeHashes: [],
          mfaEnrolledAt: null,
          updatedAt: now,
        })
        .onConflict((conflict) => conflict.column("canonicalUsername").doUpdateSet({
          username: canonicalUsername,
          email: account.email,
          canonicalEmail,
          name: account.name,
          passwordHash,
          twoFactorEnabled: false,
          disabled: false,
          mustChangePassword: false,
          mustCompleteProfile: false,
          mfaRequired: false,
          totpSecretCiphertext: null,
          pendingTotpSecretCiphertext: null,
          recoveryCodeHashes: [],
          mfaEnrolledAt: null,
          updatedAt: now,
        }))
        .returningAll()
        .executeTakeFirstOrThrow();
      await transaction
        .insertInto("memberships")
        .values({
          orgId: organization.id,
          userId: user.id,
          role: account.role,
          status: "ACTIVE",
          pageIds: null,
          invitationExpiresAt: null,
          invitationTokenHash: null,
          activatedAt: now,
        })
        .onConflict((conflict) => conflict.columns(["orgId", "userId"]).doUpdateSet({
          role: account.role,
          status: "ACTIVE",
          pageIds: null,
          invitationExpiresAt: null,
          invitationTokenHash: null,
          activatedAt: now,
        }))
        .execute();
      await transaction.deleteFrom("authSessions").where("userId", "=", user.id).execute();
    }
  });

  console.log(
    `Created ${DEVELOPMENT_ACCOUNTS.length} development role accounts for the unified SignalHub console.`
  );
  return { password };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDevelopmentRoleUsers()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeDatabase());
}
