import { describe, expect, it } from "vitest";
import {
  evaluateMigrationState,
  migrationIssueSummary,
  type MigrationManifestEntry,
} from "../lib/migration-state";

const MIGRATION_MANIFEST: readonly MigrationManifestEntry[] = [
  { id: "001-foundation", description: "Foundation", checksum: "checksum-001" },
  { id: "002-features", description: "Features", checksum: "checksum-002" },
  { id: "003-current", description: "Current", checksum: "checksum-003" },
];

function appliedManifest(manifest: readonly MigrationManifestEntry[] = MIGRATION_MANIFEST) {
  return manifest.map((migration) => ({
    _id: migration.id,
    checksum: migration.checksum,
  }));
}

describe("migration manifest inspection", () => {
  it("requires every manifest entry with its expected checksum", () => {
    const inspection = evaluateMigrationState(appliedManifest(), MIGRATION_MANIFEST);

    expect(inspection).toMatchObject({
      current: true,
      expectedCount: MIGRATION_MANIFEST.length,
      verifiedCount: MIGRATION_MANIFEST.length,
      missingIds: [],
      checksumMismatchIds: [],
      unexpectedIds: [],
    });
  });

  it("reports an earlier missing migration even when the latest migration exists", () => {
    const [, ...withoutFirst] = appliedManifest();
    const inspection = evaluateMigrationState(withoutFirst, MIGRATION_MANIFEST);

    expect(inspection.current).toBe(false);
    expect(inspection.missingIds).toEqual([MIGRATION_MANIFEST[0].id]);
    expect(inspection.verifiedCount).toBe(MIGRATION_MANIFEST.length - 1);
  });

  it("reports checksum drift instead of treating the record as verified", () => {
    const applied = appliedManifest();
    applied[1] = { ...applied[1], checksum: "unexpected-checksum" };
    const inspection = evaluateMigrationState(applied, MIGRATION_MANIFEST);

    expect(inspection.current).toBe(false);
    expect(inspection.checksumMismatchIds).toEqual([MIGRATION_MANIFEST[1].id]);
    expect(inspection.verifiedCount).toBe(MIGRATION_MANIFEST.length - 1);
  });

  it("reports a database-ahead migration unknown to the running binary", () => {
    const inspection = evaluateMigrationState(
      [
        ...appliedManifest(),
        { _id: "004-future-release", checksum: "checksum-004" },
      ],
      MIGRATION_MANIFEST
    );

    expect(inspection.current).toBe(false);
    expect(inspection.unexpectedIds).toEqual(["004-future-release"]);
    expect(inspection.verifiedCount).toBe(MIGRATION_MANIFEST.length);
    expect(migrationIssueSummary(inspection)).toContain("unexpected 004-future-release");
  });
});
