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
import { usersPath } from "../paths";
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
