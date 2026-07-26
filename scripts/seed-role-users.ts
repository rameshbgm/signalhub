import { ObjectId } from "mongodb";
import { hashPassword } from "@/lib/auth";
import { collections, mongoClient } from "@/lib/db";
import { DEVELOPMENT_ACCOUNTS } from "@/lib/dev-accounts";
import { canonicalizeEmail, canonicalizeUsername } from "@/lib/identity";
import { newPasswordError } from "@/lib/password-policy";
import { assertDevelopmentSeedEnabled } from "@/scripts/dev-seed";
import { pathToFileURL } from "node:url";

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

  const existingDevelopmentOrganization =
    (await collections.organizations().findOne({ slug: "acme" })) ??
    (await collections.organizations().findOne({ slug: "default" }));
  await collections.organizations().updateOne(
    existingDevelopmentOrganization ? { _id: existingDevelopmentOrganization._id } : { slug: "acme" },
    {
      $set: {
        name: "Acme Corporation",
        slug: "acme",
        contactEmail: "admin@status.test",
        suspended: false,
        status: "ACTIVE",
        statusReason: null,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        statusChangedAt: now,
        statusChangedBy: null,
        createdAt: now,
      },
    },
    { upsert: true }
  );
  const organization = await collections.organizations().findOne({ slug: "acme" });
  if (!organization) throw new Error("Unable to create the development organization");

  for (const account of DEVELOPMENT_ACCOUNTS) {
    const canonicalEmail = canonicalizeEmail(account.email);
    const canonicalUsername = canonicalizeUsername(account.username);
      await collections.users().updateOne(
        { canonicalUsername },
        {
          $set: {
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
          },
          $setOnInsert: {
            _id: new ObjectId(),
            sessionVersion: 1,
            createdAt: now,
          },
        },
        { upsert: true }
      );
      const user = await collections.users().findOne({ canonicalUsername });
      if (!user) throw new Error(`Unable to create ${account.email}`);
      await collections.memberships().updateOne(
        { orgId: organization._id, userId: user._id },
        {
          $set: {
            role: account.role,
            status: "ACTIVE",
            pageIds: null,
            invitationExpiresAt: null,
            invitationTokenHash: null,
            activatedAt: now,
          },
          $setOnInsert: { _id: new ObjectId(), createdAt: now },
        },
        { upsert: true }
      );
      await collections.authSessions().deleteMany({ userId: user._id });
  }

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
    .finally(() => mongoClient.close());
}
