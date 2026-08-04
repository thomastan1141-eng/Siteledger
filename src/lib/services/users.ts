import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { COMPANY_ID } from "../constants";
import { AUTH_BYPASS, DEMO_ADMIN, DEMO_CLIENT } from "../demo";
import { setupMetaPath, usersPath } from "../paths";
import type { AppUser, UserRole } from "../types";

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  if (AUTH_BYPASS) {
    if (uid === DEMO_CLIENT.uid) return DEMO_CLIENT;
    return DEMO_ADMIN;
  }
  const snap = await getDoc(doc(db, usersPath(), uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...(snap.data() as Omit<AppUser, "uid">) };
}

/**
 * First Firebase Auth user to sign in (before setup meta exists)
 * becomes the company admin and locks further self-provisioning.
 */
export async function ensureBootstrapAdmin(input: {
  uid: string;
  email: string;
  displayName?: string;
}): Promise<AppUser | null> {
  if (AUTH_BYPASS) return DEMO_ADMIN;

  const existing = await getUserProfile(input.uid);
  if (existing) return existing;

  const setupRef = doc(db, setupMetaPath());
  const setupSnap = await getDoc(setupRef);
  if (setupSnap.exists()) {
    return null;
  }

  const now = new Date().toISOString();
  const profile: AppUser = {
    uid: input.uid,
    email: input.email.trim(),
    displayName:
      input.displayName?.trim() ||
      input.email.trim().split("@")[0] ||
      "Admin",
    role: "admin",
    companyId: COMPANY_ID,
    projectIds: [],
    active: true,
    createdAt: now,
  };

  await setDoc(doc(db, usersPath(), input.uid), {
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    companyId: profile.companyId,
    projectIds: profile.projectIds,
    active: profile.active,
    createdAt: profile.createdAt,
    updatedAt: now,
  });

  await setDoc(setupRef, {
    completed: true,
    adminUid: input.uid,
    adminEmail: profile.email,
    completedAt: now,
  });

  return profile;
}

export async function upsertUserProfile(
  uid: string,
  data: Partial<AppUser> & {
    email: string;
    role: UserRole;
    displayName: string;
  },
) {
  const ref = doc(db, usersPath(), uid);
  const existing = await getDoc(ref);
  const payload = {
    ...data,
    companyId: data.companyId || COMPANY_ID,
    projectIds: data.projectIds || [],
    active: data.active ?? true,
    updatedAt: new Date().toISOString(),
    ...(existing.exists()
      ? {}
      : { createdAt: new Date().toISOString() }),
  };
  await setDoc(ref, payload, { merge: true });
}

export async function listUsersByRole(role?: UserRole) {
  if (AUTH_BYPASS) {
    const users = [DEMO_ADMIN, DEMO_CLIENT];
    return role ? users.filter((u) => u.role === role) : users;
  }
  const snap = await getDocs(collection(db, usersPath()));
  return snap.docs
    .map(
      (d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, "uid">) }) as AppUser,
    )
    .filter((u) => (role ? u.role === role : true));
}

export async function setClientAccess(uid: string, active: boolean) {
  if (AUTH_BYPASS) return;
  await updateDoc(doc(db, usersPath(), uid), {
    active,
    updatedAt: new Date().toISOString(),
  });
}
