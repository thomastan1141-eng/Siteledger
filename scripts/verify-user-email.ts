import { ensureAdcFromFirebaseLogin } from "./lib/admin-credentials.cjs";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/verify-user-email.ts <email>");
    process.exit(1);
  }

  await ensureAdcFromFirebaseLogin();
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    });
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  console.log("Found user:", {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    creationTime: user.metadata.creationTime,
  });

  if (user.emailVerified) {
    console.log("Already verified — nothing to do.");
    return;
  }

  await auth.updateUser(user.uid, { emailVerified: true });
  console.log("Marked emailVerified = true for", email);
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
