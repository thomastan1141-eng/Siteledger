import { initializeApp, deleteApp, getApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { COMPANY_ID } from "../constants";
import { AUTH_BYPASS } from "../demo";
import { projectsPath, usersPath } from "../paths";
import { upsertUserProfile } from "./users";
import type { UserRole } from "../types";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Create Auth user without replacing the current admin session. */
export async function inviteUser(input: {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  projectIds?: string[];
}) {
  if (AUTH_BYPASS) {
    return `demo-${input.role}-${Date.now()}`;
  }

  const secondary = initializeApp(firebaseConfig, `invite-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      input.email.trim(),
      input.password,
    );

    await upsertUserProfile(cred.user.uid, {
      email: input.email.trim(),
      displayName: input.displayName.trim(),
      role: input.role,
      companyId: COMPANY_ID,
      projectIds: input.projectIds || [],
      active: true,
      createdAt: new Date().toISOString(),
    });

    if (input.role === "client" && input.projectIds?.length) {
      await Promise.all(
        input.projectIds.map((projectId) =>
          updateDoc(doc(db, projectsPath(), projectId), {
            clientUserIds: arrayUnion(cred.user.uid),
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
    }

    if (input.role === "staff" && input.projectIds?.length) {
      await Promise.all(
        input.projectIds.map((projectId) =>
          updateDoc(doc(db, projectsPath(), projectId), {
            staffIds: arrayUnion(cred.user.uid),
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
    }

    return cred.user.uid;
  } finally {
    await deleteApp(secondary).catch(() => {
      try {
        getApp(`invite`);
      } catch {
        /* ignore */
      }
    });
  }
}

export async function attachClientToProject(
  projectId: string,
  clientUid: string,
) {
  await updateDoc(doc(db, projectsPath(), projectId), {
    clientUserIds: arrayUnion(clientUid),
    updatedAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, usersPath(), clientUid), {
    projectIds: arrayUnion(projectId),
    updatedAt: new Date().toISOString(),
  });
}
