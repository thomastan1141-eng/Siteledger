import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Server-only Firebase Admin.
 * Prefer Application Default Credentials on App Hosting.
 * Optionally set FIREBASE_SERVICE_ACCOUNT_JSON (raw JSON string) for local/dev.
 * Never commit a service-account JSON file.
 */
function initAdmin(): App {
  if (getApps().length) return getApps()[0]!;

  // Required for getStorage().bucket() (no explicit name) to resolve a
  // default bucket — without this every Admin Storage call throws
  // "Bucket name not specified or invalid" (surfaces as a generic 500 from
  // routes like /api/media/[mediaId]/download and /visibility).
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const parsed = JSON.parse(json) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    return initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
      }),
      storageBucket,
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket,
  });
}

export function getAdminApp() {
  return initAdmin();
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
