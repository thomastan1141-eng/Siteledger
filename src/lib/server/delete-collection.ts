import "server-only";

import type { Firestore } from "firebase-admin/firestore";

/** Delete all documents in a collection path, in batches (Admin SDK). */
export async function deleteCollectionInBatches(
  db: Firestore,
  collectionPath: string,
  batchSize = 400,
) {
  for (;;) {
    const snap = await db.collection(collectionPath).limit(batchSize).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < batchSize) return;
  }
}
