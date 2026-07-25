import { ObjectId } from "mongodb";
import { hashPassword } from "@/lib/auth";
import { collections, mongoClient } from "@/lib/db";
import { DEVELOPMENT_ACCOUNTS } from "@/lib/dev-accounts";
import { encryptSecret } from "@/lib/encryption";
import { canonicalizeEmail } from "@/lib/identity";
import { newPasswordError } from "@/lib/password-policy";
import { assertDevelopmentSeedEnabled } from "@/scripts/dev-seed";

async function main() {
  assertDevelopmentSeedEnabled("The role-account seed");
  const password = process.env.DEV_ROLE_PASSWORD ?? "";
  const passwordError = newPasswordError(password);
  if (passwordError) {
    throw new Error(`DEV_ROLE_PASSWORD: ${passwordError}`);
  }
  const passwordHash = await hashPassword(password);
  const platformTotpSecret = (process.env.DEV_PLATFORM_TOTP_SECRET ?? "")
    .trim()
    .replaceAll(" ", "")
    .toUpperCase();
  if (!/^[A-Z2-7]{32,}$/.test(platformTotpSecret)) {
    throw new Error(
      "DEV_PLATFORM_TOTP_SECRET must be a Base32 authenticator secret containing at least 32 characters"
    );
  }
  const now = new Date();

  await collections.organizations().updateOne(
    { slug: "acme" },
    {
      $set: {
        name: "Acme Corporation",
        contactEmail: "tenant-owner@acme.test",
        suspended: false,
        status: "ACTIVE",
        statusReason: null,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: new ObjectId(),
        slug: "acme",
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
    if (account.audience === "tenant") {
      await collections.users().updateOne(
        { canonicalEmail },
        {
          $set: {
            email: account.email,
            canonicalEmail,
            name: account.name,
            passwordHash,
            twoFactorEnabled: false,
            disabled: false,
            mustChangePassword: false,
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
      const user = await collections.users().findOne({ canonicalEmail });
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
      continue;
    }

    await collections.platformAdmins().updateOne(
      { canonicalEmail },
      {
        $set: {
          email: account.email,
          canonicalEmail,
          name: account.name,
          passwordHash,
          role: account.role,
          status: "ACTIVE",
          totpSecretCiphertext: encryptSecret(platformTotpSecret),
          pendingTotpSecretCiphertext: null,
          recoveryCodeHashes: [],
          mfaEnrolledAt: now,
          disabledAt: null,
          disabledBy: null,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          sessionVersion: 1,
          lastLoginAt: null,
          createdAt: now,
        },
      },
      { upsert: true }
    );
    const platformAdmin = await collections.platformAdmins().findOne({ canonicalEmail });
    if (!platformAdmin) throw new Error(`Unable to create ${account.email}`);
    await collections.authSessions().deleteMany({ platformAdminId: platformAdmin._id });
  }

  console.log(
    `Created ${DEVELOPMENT_ACCOUNTS.length} development role accounts for Acme and the platform console.`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoClient.close());
