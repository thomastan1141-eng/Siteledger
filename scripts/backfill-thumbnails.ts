/**
 * Backfill 480px JPEG thumbnails for 19 Burnfoot terrace photos that lack
 * `thumbnailPath`. Never replaces or deletes originals.
 *
 * Coverage:
 *   - Firebase media photo docs missing thumbnailPath
 *   - Purchase photo entries missing thumbnailPath (same project)
 *
 * Usage:
 *   npm run backfill:thumbnails            # dry run
 *   npm run backfill:thumbnails -- --execute
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { ensureAdcFromFirebaseLogin } from "./lib/admin-credentials.cjs";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";
import { thumbnailStoragePath } from "../src/lib/paths";
import { THUMB_JPEG_QUALITY, THUMB_MAX_EDGE } from "../src/lib/image-compress";

const EXECUTE = process.argv.includes("--execute");
const WORKSPACE_ID = "of48TrPRWKkttuyjfm2N";
const PROJECT_ID = "LHpvPMEBtdmUHL3TIFqT";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i <= 0) continue;
      const key = line.slice(0, i).trim();
      const val = line.slice(i + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

async function initAdmin() {
  loadEnvLocal();
  await ensureAdcFromFirebaseLogin();
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!getApps().length) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) {
      const parsed = JSON.parse(json) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      initializeApp({
        credential: cert({
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
        }),
        storageBucket,
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({
        credential: applicationDefault(),
        projectId:
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket,
      });
    } else {
      throw new Error(
        "Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON",
      );
    }
  }
  return {
    db: getFirestore(),
    bucket: getStorage().bucket(),
  };
}

async function makeThumbJpeg(bytes: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(bytes)
      .rotate()
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: Math.round(THUMB_JPEG_QUALITY * 100) })
      .toBuffer();
  } catch {
    return null;
  }
}

function mediaClientVisibleFlag(data: Record<string, unknown>): string {
  if (
    data.clientVisible === true ||
    data.visibility === "client_visible" ||
    data.visibility === "handover"
  ) {
    return "true";
  }
  return "false";
}

async function main() {
  const { db, bucket } = await initAdmin();
  const mediaCol = db.collection(
    `companies/${WORKSPACE_ID}/projects/${PROJECT_ID}/media`,
  );
  const mediaSnap = await mediaCol.get();

  const mediaTargets = mediaSnap.docs.filter((d) => {
    const data = d.data();
    if (data.type && data.type !== "photo") return false;
    if (data.provider === "BUNNY_STREAM") return false;
    if (data.mediaLifecycle && data.mediaLifecycle !== "active") return false;
    if (!data.storagePath || typeof data.storagePath !== "string") return false;
    if (data.thumbnailPath && String(data.thumbnailPath).trim()) return false;
    return true;
  });

  console.log(`Burnfoot media docs: ${mediaSnap.size}`);
  console.log(`Media photos missing thumbnailPath: ${mediaTargets.length}`);

  const purchaseSnap = await db
    .collection(`companies/${WORKSPACE_ID}/projects/${PROJECT_ID}/purchases`)
    .get();
  type PurchaseJob = {
    purchaseId: string;
    photoIndex: number;
    storagePath: string;
    uploadedBy?: string;
  };
  const purchaseJobs: PurchaseJob[] = [];
  for (const doc of purchaseSnap.docs) {
    const photos = Array.isArray(doc.data().photos) ? doc.data().photos : [];
    photos.forEach((p: Record<string, unknown>, photoIndex: number) => {
      const storagePath =
        typeof p.storagePath === "string" ? p.storagePath.trim() : "";
      const thumbnailPath =
        typeof p.thumbnailPath === "string" ? p.thumbnailPath.trim() : "";
      if (!storagePath || thumbnailPath) return;
      purchaseJobs.push({
        purchaseId: doc.id,
        photoIndex,
        storagePath,
        uploadedBy:
          typeof p.uploadedBy === "string" ? p.uploadedBy : undefined,
      });
    });
  }
  console.log(`Purchase photos missing thumbnailPath: ${purchaseJobs.length}`);

  if (!EXECUTE) {
    console.log("\nDry run only. Re-run with --execute to write changes.");
    for (const d of mediaTargets.slice(0, 8)) {
      console.log(`  media ${d.id} → ${d.data().storagePath}`);
    }
    for (const j of purchaseJobs.slice(0, 8)) {
      console.log(
        `  purchase ${j.purchaseId}[${j.photoIndex}] → ${j.storagePath}`,
      );
    }
    return;
  }

  let mediaOk = 0;
  let mediaSkip = 0;
  for (const doc of mediaTargets) {
    const data = doc.data();
    const storagePath = String(data.storagePath);
    const thumbPath = thumbnailStoragePath(storagePath);
    try {
      const [bytes] = await bucket.file(storagePath).download();
      const jpeg = await makeThumbJpeg(bytes);
      if (!jpeg) {
        console.warn(`skip media ${doc.id}: could not decode`);
        mediaSkip += 1;
        continue;
      }
      const meta: Record<string, string> = {
        mediaId: doc.id,
        clientVisible: mediaClientVisibleFlag(data),
        uploadedBy: String(data.uploadedBy || ""),
        projectId: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        kind: "thumbnail",
      };
      await bucket.file(thumbPath).save(jpeg, {
        contentType: "image/jpeg",
        metadata: { metadata: meta },
        resumable: false,
      });
      await doc.ref.update({
        thumbnailPath: thumbPath,
        updatedAt: new Date().toISOString(),
      });
      mediaOk += 1;
      console.log(`media ok ${doc.id}`);
    } catch (err) {
      mediaSkip += 1;
      console.warn(
        `skip media ${doc.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  let purchaseOk = 0;
  let purchaseSkip = 0;
  // Group by purchase so we rewrite the photos array once per doc.
  const byPurchase = new Map<string, PurchaseJob[]>();
  for (const job of purchaseJobs) {
    const list = byPurchase.get(job.purchaseId) || [];
    list.push(job);
    byPurchase.set(job.purchaseId, list);
  }
  for (const [purchaseId, jobs] of byPurchase) {
    const ref = db.doc(
      `companies/${WORKSPACE_ID}/projects/${PROJECT_ID}/purchases/${purchaseId}`,
    );
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    const photos = Array.isArray(data.photos)
      ? [...(data.photos as Record<string, unknown>[])]
      : [];
    let changed = false;
    for (const job of jobs) {
      const photo = photos[job.photoIndex];
      if (!photo || typeof photo !== "object") {
        purchaseSkip += 1;
        continue;
      }
      if (
        typeof photo.thumbnailPath === "string" &&
        photo.thumbnailPath.trim()
      ) {
        continue;
      }
      const thumbPath = thumbnailStoragePath(job.storagePath);
      try {
        const [bytes] = await bucket.file(job.storagePath).download();
        const jpeg = await makeThumbJpeg(bytes);
        if (!jpeg) {
          purchaseSkip += 1;
          console.warn(
            `skip purchase ${purchaseId}[${job.photoIndex}]: decode failed`,
          );
          continue;
        }
        await bucket.file(thumbPath).save(jpeg, {
          contentType: "image/jpeg",
          metadata: {
            metadata: {
              kind: "thumbnail",
              purchaseId,
              projectId: PROJECT_ID,
              workspaceId: WORKSPACE_ID,
              uploadedBy: String(
                job.uploadedBy || data.createdBy || data.updatedBy || "",
              ),
            },
          },
          resumable: false,
        });
        photos[job.photoIndex] = { ...photo, thumbnailPath: thumbPath };
        changed = true;
        purchaseOk += 1;
        console.log(`purchase ok ${purchaseId}[${job.photoIndex}]`);
      } catch (err) {
        purchaseSkip += 1;
        console.warn(
          `skip purchase ${purchaseId}[${job.photoIndex}]:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    if (changed) {
      await ref.update({
        photos,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // Verify media
  const verify = await mediaCol.get();
  const stillMissing = verify.docs.filter((d) => {
    const data = d.data();
    if (data.type && data.type !== "photo") return false;
    if (data.provider === "BUNNY_STREAM") return false;
    if (data.mediaLifecycle && data.mediaLifecycle !== "active") return false;
    if (!data.storagePath) return false;
    return !(data.thumbnailPath && String(data.thumbnailPath).trim());
  });

  console.log("\n--- summary ---");
  console.log(`media written: ${mediaOk}, skipped: ${mediaSkip}`);
  console.log(`purchase written: ${purchaseOk}, skipped: ${purchaseSkip}`);
  console.log(
    `media photos still missing thumbnailPath: ${stillMissing.length}`,
  );
  if (stillMissing.length) {
    for (const d of stillMissing.slice(0, 20)) {
      console.log(`  ${d.id}`);
    }
    process.exitCode = 1;
  } else {
    console.log("✅ All active Burnfoot media photos have thumbnailPath.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
