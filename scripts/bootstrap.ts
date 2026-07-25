import { ObjectId } from "mongodb";
import { hashPassword } from "@/lib/auth";
import { collections, mongoClient } from "@/lib/db";
import { ensureIndexes } from "@/lib/ensure-indexes";
import { canonicalizeEmail } from "@/lib/identity";
import { runMigrations } from "@/lib/migrations";
import { newPasswordError } from "@/lib/password-policy";

function argumentsMap() {
  const result = new Map<string, string | true>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    if (argument === "--password-stdin" || argument === "--platform-only") {
      result.set(argument, true);
      continue;
    }
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    result.set(argument, value);
    index += 1;
  }
  if (result.has("--password")) {
    throw new Error("Passwords on the command line are not supported; use --password-stdin");
  }
  return result;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function passwordFrom(args: Map<string, string | true>) {
  if (args.has("--password-stdin")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
  }
  return process.env.STATUS_BOOTSTRAP_PASSWORD ?? "";
}

async function main() {
  const args = argumentsMap();
  const email = canonicalizeEmail(
    String(args.get("--email") ?? process.env.STATUS_BOOTSTRAP_EMAIL ?? "")
  );
  const name = String(args.get("--name") ?? process.env.STATUS_BOOTSTRAP_NAME ?? "").trim();
  const orgName = String(
    args.get("--org-name") ?? process.env.STATUS_BOOTSTRAP_ORG_NAME ?? ""
  ).trim();
  const orgSlug = slugify(
    String(args.get("--org-slug") ?? process.env.STATUS_BOOTSTRAP_ORG_SLUG ?? orgName)
  );
  const password = await passwordFrom(args);
  const platformOnly = args.has("--platform-only");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid --email is required");
  if (!name) throw new Error("--name is required");
  if (!platformOnly && (!orgName || !orgSlug)) {
    throw new Error("--org-name and a valid organization slug are required");
  }
  const passwordError = newPasswordError(password, [name, email]);
  if (passwordError) throw new Error(passwordError);

  await runMigrations();
  await ensureIndexes();

  const existingPlatformAdmin = await collections.platformAdmins().findOne({});
  if (platformOnly) {
    const activeOwners = await collections.platformAdmins().countDocuments({
      role: "OWNER",
      status: { $ne: "DISABLED" },
    });
    if (activeOwners > 0) {
      throw new Error(
        "An active platform Owner already exists; use an Owner invitation from the platform console"
      );
    }
    const passwordHash = await hashPassword(password);
    const now = new Date();
    const existing = await collections.platformAdmins().findOne({
      $or: [{ canonicalEmail: email }, { email }],
    });
    const adminId = existing?._id ?? new ObjectId();
    if (existing) {
      await collections.platformAdmins().updateOne(
        { _id: existing._id },
        {
          $set: {
            email,
            canonicalEmail: email,
            name,
            passwordHash,
            role: "OWNER",
            status: "ACTIVE",
            totpSecretCiphertext: null,
            pendingTotpSecretCiphertext: null,
            recoveryCodeHashes: [],
            mfaEnrolledAt: null,
            disabledAt: null,
            disabledBy: null,
            updatedAt: now,
          },
          $inc: { sessionVersion: 1 },
        }
      );
    } else {
      await collections.platformAdmins().insertOne({
        _id: adminId,
        email,
        canonicalEmail: email,
        passwordHash,
        name,
        role: "OWNER",
        status: "ACTIVE",
        sessionVersion: 1,
        totpSecretCiphertext: null,
        pendingTotpSecretCiphertext: null,
        recoveryCodeHashes: [],
        mfaEnrolledAt: null,
        lastLoginAt: null,
        disabledAt: null,
        disabledBy: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    await collections.platformAuditLogs().insertOne({
      _id: new ObjectId(),
      actorId: adminId,
      actorEmail: email,
      actorRole: "OWNER",
      action: "PLATFORM_OWNER_RECOVERED_FROM_CLI",
      targetType: "platformAdmin",
      targetId: adminId.toHexString(),
      organizationId: null,
      reason: "No active platform Owner remained",
      metadata: { existingAccountReactivated: Boolean(existing) },
      createdAt: now,
    });
    console.log(
      `Platform Owner ${email} is active. TOTP enrollment is required at the next login.`
    );
    return;
  }
  if (existingPlatformAdmin) {
    if (canonicalizeEmail(existingPlatformAdmin.email) !== email) {
      throw new Error(
        `This instance is already bootstrapped as ${existingPlatformAdmin.email}; refusing to create another first administrator`
      );
    }
    console.log("SignalHub is already bootstrapped; no changes were made.");
    return;
  }
  if (
    (await collections.organizations().findOne({ slug: orgSlug })) ||
    (await collections.users().findOne({ canonicalEmail: email }))
  ) {
    throw new Error("Bootstrap stopped because the requested organization or identity already exists");
  }

  const passwordHash = await hashPassword(password);
  const platformAdminId = new ObjectId();
  const organizationId = new ObjectId();
  const userId = new ObjectId();
  const membershipId = new ObjectId();
  const now = new Date();
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      // Recheck inside the transaction to make concurrent bootstrap attempts safe.
      if (await collections.platformAdmins().findOne({}, { session })) {
        throw new Error("Another bootstrap process completed first");
      }
      await collections.platformAdmins().insertOne(
        {
          _id: platformAdminId,
          email,
          canonicalEmail: email,
          passwordHash,
          name,
          role: "OWNER",
          status: "ACTIVE",
          sessionVersion: 1,
          totpSecretCiphertext: null,
          pendingTotpSecretCiphertext: null,
          recoveryCodeHashes: [],
          mfaEnrolledAt: null,
          lastLoginAt: null,
          disabledAt: null,
          disabledBy: null,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );
      await collections.organizations().insertOne(
        {
          _id: organizationId,
          name: orgName,
          slug: orgSlug,
          contactEmail: email,
          suspended: false,
          status: "ACTIVE",
          statusReason: null,
          statusChangedAt: now,
          statusChangedBy: platformAdminId,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );
      await collections.users().insertOne(
        {
          _id: userId,
          email,
          canonicalEmail: email,
          passwordHash,
          name,
          twoFactorEnabled: false,
          oidcIssuer: null,
          oidcSubject: null,
          disabled: false,
          createdAt: now,
          updatedAt: now,
        },
        { session }
      );
      await collections.memberships().insertOne(
        {
          _id: membershipId,
          orgId: organizationId,
          userId,
          role: "OWNER",
          status: "ACTIVE",
          pageIds: null,
          activatedAt: now,
          createdAt: now,
        },
        { session }
      );
      await collections.auditLogs().insertOne(
        {
          _id: new ObjectId(),
          orgId: organizationId,
          actor: email,
          action: "BOOTSTRAP_INSTANCE",
          target: orgSlug,
          createdAt: now,
        },
        { session }
      );
      await collections.platformAuditLogs().insertOne(
        {
          _id: new ObjectId(),
          actorId: platformAdminId,
          actorEmail: email,
          actorRole: "OWNER",
          action: "INSTANCE_BOOTSTRAPPED",
          targetType: "organization",
          targetId: organizationId.toHexString(),
          organizationId,
          reason: null,
          metadata: { slug: orgSlug },
          createdAt: now,
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  console.log(`SignalHub bootstrapped for ${email} with organization ${orgSlug}.`);
}

main()
  .then(() => mongoClient.close())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await mongoClient.close().catch(() => undefined);
    process.exitCode = 1;
  });
