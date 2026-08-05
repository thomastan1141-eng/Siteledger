/**
 * Stage B2 — Media `mediaLifecycle` backfill.
 *
 * Rule: ONLY sets `mediaLifecycle` on media docs missing the field entirely.
 * NEVER overwrites an existing `mediaLifecycle` value.
 *   - status in [DELETED, CANCELLED]  -> mediaLifecycle = "tombstoned"
 *   - otherwise (or no status field)  -> mediaLifecycle = "active"
 *
 * This MUST run (and be verified at 0 missing) before any query changes or
 * Rules tightening that depend on `mediaLifecycle` — see docs/firebase-remediation-roadmap.md.
 *
 * Usage:
 *   npm run backfill:media-lifecycle            # dry run (read-only)
 *   npm run backfill:media-lifecycle -- --execute
 */
import { getScriptDb } from "./lib/admin";
import { writeBackup, runBatchUpdates } from "./lib/backfill-utils";

const EXECUTE = process.argv.includes("--execute");
const TOMBSTONED_STATUSES = new Set(["DELETED", "CANCELLED"]);

function targetLifecycle(data: Record<string, unknown>): "active" | "tombstoned" {
  const status = typeof data.status === "string" ? data.status : undefined;
  return status && TOMBSTONED_STATUSES.has(status) ? "tombstoned" : "active";
}

async function main() {
  const db = await getScriptDb();

  console.log("Scanning collection group `media` for missing `mediaLifecycle`...");
  const snap = await db.collectionGroup("media").get();
  const missing = snap.docs.filter((d) => !("mediaLifecycle" in d.data()));

  const willBeActive = missing.filter((d) => targetLifecycle(d.data()) === "active").length;
  const willBeTombstoned = missing.length - willBeActive;

  console.log(`Scanned ${snap.size} media docs total.`);
  console.log(`Missing \`mediaLifecycle\`: ${missing.length}`);
  console.log(`  -> would set "active": ${willBeActive}`);
  console.log(`  -> would set "tombstoned": ${willBeTombstoned}`);
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

  const backupFile = writeBackup("media-lifecycle-backfill", missing);
  console.log(`Backup snapshot written: ${backupFile}`);

  console.log(`Writing mediaLifecycle to ${missing.length} docs...`);
  await runBatchUpdates(db, missing, (doc) => ({
    mediaLifecycle: targetLifecycle(doc.data()),
  }));

  console.log("Verifying zero missing mediaLifecycle fields remain...");
  const verifySnap = await db.collectionGroup("media").get();
  const stillMissing = verifySnap.docs.filter((d) => !("mediaLifecycle" in d.data()));
  if (stillMissing.length === 0) {
    console.log("✅ Verified: 0 media docs missing `mediaLifecycle`.");
  } else {
    console.error(
      `❌ Verification failed: ${stillMissing.length} media docs still missing mediaLifecycle:`,
      stillMissing.map((d) => d.ref.path),
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
