import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Application-level backup: snapshots full data of every doc about to be
 * touched, before any write happens. Not a substitute for a managed Firestore
 * export, but sufficient here because every write in these scripts is an
 * additive merge of a single missing field (never overwrites existing data).
 */
export function writeBackup(name: string, docs: QueryDocumentSnapshot[]) {
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const payload = docs.map((d) => ({ path: d.ref.path, data: d.data() }));
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

export async function runBatchUpdates(
  db: FirebaseFirestore.Firestore,
  docs: QueryDocumentSnapshot[],
  buildUpdate: (doc: QueryDocumentSnapshot) => Record<string, unknown>,
  batchSize = 400,
) {
  let written = 0;
  for (const group of chunk(docs, batchSize)) {
    const batch = db.batch();
    for (const doc of group) {
      batch.update(doc.ref, buildUpdate(doc));
    }
    await batch.commit();
    written += group.length;
    console.log(`  committed ${written}/${docs.length}`);
  }
  return written;
}
