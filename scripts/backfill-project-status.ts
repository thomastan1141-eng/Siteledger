/**
 * Stage B1 — Project `status` backfill.
 *
 * Rule: ONLY sets `status` on projects that are missing the field entirely.
 * Defaults missing status to "upcoming". NEVER overwrites an existing status,
 * including "trashed", "purging", or any other value already present.
 *
 * Usage:
 *   npm run backfill:project-status            # dry run (read-only)
 *   npm run backfill:project-status -- --execute
 */
import { getScriptDb } from "./lib/admin";
import { writeBackup, runBatchUpdates } from "./lib/backfill-utils";

const EXECUTE = process.argv.includes("--execute");
const DEFAULT_STATUS = "upcoming";

async function main() {
  const db = await getScriptDb();

  console.log("Scanning collection group `projects` for missing `status`...");
  const snap = await db.collectionGroup("projects").get();
  const missing = snap.docs.filter((d) => !("status" in d.data()));

  console.log(`Scanned ${snap.size} project docs total.`);
  console.log(`Missing \`status\`: ${missing.length}`);
  if (missing.length > 0) {
    console.log("Sample paths (up to 10):");
    for (const d of missing.slice(0, 10)) console.log(`  - ${d.ref.path}`);
  }

  if (!EXECUTE) {
    console.log("\nDry run only. Re-run with --execute to write changes.");
    return;
  }

  if (missing.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const backupFile = writeBackup("project-status-backfill", missing);
  console.log(`Backup snapshot written: ${backupFile}`);

  console.log(`Writing status="${DEFAULT_STATUS}" to ${missing.length} docs...`);
  await runBatchUpdates(db, missing, () => ({ status: DEFAULT_STATUS }));

  console.log("Verifying zero missing status fields remain...");
  const verifySnap = await db.collectionGroup("projects").get();
  const stillMissing = verifySnap.docs.filter((d) => !("status" in d.data()));
  if (stillMissing.length === 0) {
    console.log("✅ Verified: 0 projects missing `status`.");
  } else {
    console.error(
      `❌ Verification failed: ${stillMissing.length} projects still missing status:`,
      stillMissing.map((d) => d.ref.path),
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
