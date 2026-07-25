export type MigrationManifestEntry = Readonly<{
  id: string;
  description: string;
  checksum: string;
}>;

export type MigrationInspection = Readonly<{
  current: boolean;
  expectedCount: number;
  verifiedCount: number;
  missingIds: string[];
  checksumMismatchIds: string[];
  unexpectedIds: string[];
}>;

export function evaluateMigrationState(
  appliedMigrations: ReadonlyArray<{ _id: string; checksum: string }>,
  manifest: readonly MigrationManifestEntry[]
): MigrationInspection {
  const appliedById = new Map(
    appliedMigrations.map((migration) => [migration._id, migration.checksum])
  );
  const expectedIds = new Set(manifest.map((migration) => migration.id));
  const missingIds: string[] = [];
  const checksumMismatchIds: string[] = [];
  const unexpectedIds = appliedMigrations
    .map((migration) => migration._id)
    .filter((id) => !expectedIds.has(id))
    .sort();
  let verifiedCount = 0;

  for (const expected of manifest) {
    const appliedChecksum = appliedById.get(expected.id);
    if (appliedChecksum === undefined) {
      missingIds.push(expected.id);
    } else if (appliedChecksum !== expected.checksum) {
      checksumMismatchIds.push(expected.id);
    } else {
      verifiedCount += 1;
    }
  }

  return {
    current:
      missingIds.length === 0 &&
      checksumMismatchIds.length === 0 &&
      unexpectedIds.length === 0,
    expectedCount: manifest.length,
    verifiedCount,
    missingIds,
    checksumMismatchIds,
    unexpectedIds,
  };
}

export function migrationIssueSummary(state: MigrationInspection) {
  const issues: string[] = [];
  if (state.missingIds.length) {
    issues.push(`missing ${state.missingIds.join(", ")}`);
  }
  if (state.checksumMismatchIds.length) {
    issues.push(`checksum mismatch ${state.checksumMismatchIds.join(", ")}`);
  }
  if (state.unexpectedIds.length) {
    issues.push(`unexpected ${state.unexpectedIds.join(", ")}`);
  }
  return issues.join(" · ");
}
