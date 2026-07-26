import { ObjectId } from "mongodb";
import { hashPassword } from "@/lib/auth";
import { collections, mongoClient } from "@/lib/db";
import { ensureIndexes } from "@/lib/ensure-indexes";
import { canonicalizeEmail, canonicalizeUsername, usernameError } from "@/lib/identity";
import { runMigrations } from "@/lib/migrations";

function argsMap() {
  const result = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`Invalid bootstrap argument ${key ?? ""}`);
    result.set(key, value);
  }
  return result;
}

async function main() {
  const args = argsMap();
  await runMigrations();
  await ensureIndexes();

  const username = canonicalizeUsername(args.get("--username") ?? "admin");
  const invalidUsername = usernameError(username);
  if (invalidUsername) throw new Error(invalidUsername);
  const password = args.get("--password") ?? "admin";
  const name = (args.get("--name") ?? "Administrator").trim();
  const email = canonicalizeEmail(args.get("--email") ?? "");
  const requestedSlug = args.get("--org-slug");
  const now = new Date();

  let organization = requestedSlug
    ? await collections.organizations().findOne({ slug: requestedSlug })
    : await collections.organizations().find({ suspended: { $ne: true } }).sort({ createdAt: 1, _id: 1 }).limit(1).next();
  if (!organization) {
    const organizationId = new ObjectId();
    await collections.organizations().insertOne({
      _id: organizationId,
      name: "Default Organization",
      slug: "default",
      contactEmail: email || null,
      suspended: false,
      status: "ACTIVE",
      statusReason: null,
      statusChangedAt: now,
      statusChangedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    organization = await collections.organizations().findOne({ _id: organizationId });
  }
  if (!organization) throw new Error("Unable to create the bootstrap organization");

  const passwordHash = await hashPassword(password);
  const existing = await collections.users().findOne({ canonicalUsername: username });
  const userId = existing?._id ?? new ObjectId();
  await collections.users().updateOne(
    { _id: userId },
    {
      $set: {
        username,
        canonicalUsername: username,
        email,
        canonicalEmail: email,
        name,
        passwordHash,
        disabled: false,
        mustChangePassword: true,
        mustCompleteProfile: !email,
        updatedAt: now,
      },
      $setOnInsert: {
        twoFactorEnabled: false,
        sessionVersion: 1,
        mfaRequired: false,
        totpSecretCiphertext: null,
        pendingTotpSecretCiphertext: null,
        recoveryCodeHashes: [],
        mfaEnrolledAt: null,
        oidcIssuer: null,
        oidcSubject: null,
        createdAt: now,
      },
    },
    { upsert: true }
  );
  await collections.memberships().updateOne(
    { orgId: organization._id, userId },
    {
      $set: { role: "ADMIN", status: "ACTIVE", pageIds: null, invitationExpiresAt: null, invitationTokenHash: null, activatedAt: now },
      $setOnInsert: { _id: new ObjectId(), createdAt: now },
    },
    { upsert: true }
  );
  await collections.authSessions().deleteMany({ userId });
  console.log(`Admin ${username} is ready and must complete account setup at the next login.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoClient.close());
