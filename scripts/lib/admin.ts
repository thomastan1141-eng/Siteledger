import { ensureAdcFromFirebaseLogin } from "./admin-credentials.cjs";
import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export async function getScriptDb() {
  await ensureAdcFromFirebaseLogin();
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
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
      });
    }
  }
  return getFirestore();
}
