import bcrypt from "bcryptjs";
import type { ClientSession } from "mongodb";
import type {
  PlatformAdminDoc,
  PlatformAdminStatus,
  PlatformRole,
} from "./db";
import { verifyTotp } from "./totp";

type PlatformAdminState = {
  role?: PlatformRole;
  status?: PlatformAdminStatus;
};

export type PlatformStepUpCredentials = {
  currentPassword: string;
  currentTotpCode: string;
};

export function isActivePlatformOwner(state: PlatformAdminState) {
  return (state.role ?? "OWNER") === "OWNER" && (state.status ?? "ACTIVE") === "ACTIVE";
}

export function transitionRemovesActivePlatformOwner(
  current: PlatformAdminState,
  next: PlatformAdminState
) {
  return isActivePlatformOwner(current) && !isActivePlatformOwner(next);
}

/**
 * Returns the compare-and-set state needed to revoke every platform session.
 *
 * Legacy administrators have no stored sessionVersion, but their signed
 * sessions are interpreted as version 1. Using `$inc` on a missing field would
 * only write 1 and leave those sessions valid, so legacy records must be
 * explicitly advanced to 2.
 */
export function platformSessionVersionTransition(
  admin: Pick<PlatformAdminDoc, "sessionVersion">
) {
  const current = admin.sessionVersion ?? 1;
  return {
    current,
    next: current + 1,
    filter:
      admin.sessionVersion === undefined
        ? { sessionVersion: { $exists: false as const } }
        : { sessionVersion: current },
  };
}

export async function platformStepUpCredentialsAreValid(
  admin: Pick<PlatformAdminDoc, "passwordHash" | "totpSecretCiphertext">,
  credentials: PlatformStepUpCredentials,
  dependencies: {
    decryptSecret: (ciphertext: string) => string;
    comparePassword?: (candidate: string, hash: string) => Promise<boolean>;
    at?: number;
  }
) {
  if (!admin.totpSecretCiphertext) return false;

  let passwordValid = false;
  let totpValid = false;
  try {
    passwordValid = await (dependencies.comparePassword ?? bcrypt.compare)(
      credentials.currentPassword,
      admin.passwordHash
    );
  } catch {
    passwordValid = false;
  }
  try {
    totpValid = verifyTotp(
      dependencies.decryptSecret(admin.totpSecretCiphertext),
      credentials.currentTotpCode,
      dependencies.at
    );
  } catch {
    totpValid = false;
  }
  return passwordValid && totpValid;
}

/**
 * Performs a fresh password + current authenticator-code check for a sensitive
 * platform action. Purge and future step-up actions can reuse this exact API.
 */
export async function requirePlatformStepUp(
  platformAdminId: string,
  formData: FormData,
  purpose = "sensitive platform action"
) {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const currentTotpCode = String(formData.get("currentTotpCode") ?? "").replace(
    /\s/g,
    ""
  );
  const inputValid =
    Boolean(currentPassword) &&
    currentPassword.length <= 1_024 &&
    /^\d{6}$/.test(currentTotpCode);

  const [
    { collections },
    { decryptSecret },
    { oid },
    { consumeRateLimit },
    { normalizedPlatformRole, writePlatformAudit },
  ] = await Promise.all([
    import("./db"),
    import("./encryption"),
    import("./mongo-utils"),
    import("./rate-limit"),
    import("./platform-policy"),
  ]);
  await consumeRateLimit("platform-step-up", platformAdminId, {
    limit: 10,
    windowMs: 15 * 60_000,
  });
  const admin = await collections.platformAdmins().findOne({
    _id: oid(platformAdminId),
    status: { $ne: "DISABLED" },
  });
  const credentialsValid =
    inputValid &&
    admin &&
    (await platformStepUpCredentialsAreValid(
      admin,
      { currentPassword, currentTotpCode },
      { decryptSecret }
    ));
  if (!credentialsValid) {
    if (admin) {
      await writePlatformAudit({
        actorId: admin._id,
        actorEmail: admin.email,
        actorRole: normalizedPlatformRole(admin),
        action: "PLATFORM_STEP_UP_FAILED",
        targetType: "platformAdmin",
        targetId: admin._id.toHexString(),
        metadata: { purpose },
      }).catch(() => undefined);
    }
    if (!inputValid) {
      throw new Error(
        "Enter your current password and current six-digit authenticator code"
      );
    }
    throw new Error("Current password or authenticator code is incorrect");
  }
}

type PlatformInvariantLockDoc = {
  _id: string;
  revision: number;
  createdAt: Date;
  updatedAt?: Date;
};

function isDuplicateKey(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000
  );
}

/**
 * Serializes platform-admin mutations through one persistent lock document.
 * Updating the lock as the transaction's first operation makes concurrent
 * transactions retry with a fresh snapshot before reauthorizing the actor or
 * checking the last-active-Owner invariant.
 */
export async function withPlatformAdminInvariantTransaction<T>(
  work: (session: ClientSession) => Promise<T>
): Promise<T> {
  const { db, mongoClient } = await import("./db");
  const locks = db.collection<PlatformInvariantLockDoc>(
    "platformInvariantLocks"
  );
  const lockId = "active-platform-owner";
  try {
    await locks.updateOne(
      { _id: lockId },
      {
        $setOnInsert: {
          revision: 0,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (error) {
    // Two first callers can race to create the lock. The winner created the
    // exact document the loser needs, so only that duplicate is safe to ignore.
    if (!isDuplicateKey(error)) throw error;
  }

  const databaseSession = mongoClient.startSession();
  let completed = false;
  let result: T | undefined;
  try {
    await databaseSession.withTransaction(async () => {
      const acquired = await locks.updateOne(
        { _id: lockId },
        {
          $inc: { revision: 1 },
          $set: { updatedAt: new Date() },
        },
        { session: databaseSession }
      );
      if (!acquired.matchedCount) {
        throw new Error("Platform administrator invariant lock is unavailable");
      }
      result = await work(databaseSession);
      completed = true;
    });
  } finally {
    await databaseSession.endSession();
  }
  if (!completed) {
    throw new Error("Platform administrator transition did not complete");
  }
  return result as T;
}
