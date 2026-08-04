import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "../firebase";
import { COMPANY_ID } from "../constants";
import { AUTH_BYPASS, DEMO_ADMIN, DEMO_CLIENT } from "../demo";
import {
  accountUserPath,
  setupMetaPath,
  usersPath,
  tenantId,
} from "../paths";
import { sanitizeForFirestore } from "../sanitize";
import type { AppUser, UserRole } from "../types";

/**
 * Prefer top-level users/{uid} (SaaS accounts), then company-scoped users
 * for invited staff/clients.
 */
export async function getUserProfile(uid: string): Promise<AppUser | null> {
  if (AUTH_BYPASS) {
    if (uid === DEMO_CLIENT.uid) return DEMO_CLIENT;
    return {
      ...DEMO_ADMIN,
      defaultWorkspaceId: COMPANY_ID,
      onboardingComplete: true,
      emailVerified: true,
    };
  }

  const accountSnap = await getDoc(doc(getFirebaseDb(), accountUserPath(uid)));
  if (accountSnap.exists()) {
    const data = accountSnap.data() as Omit<AppUser, "uid">;
    return {
      uid,
      ...data,
      companyId: data.companyId || data.defaultWorkspaceId || COMPANY_ID,
      defaultWorkspaceId:
        data.defaultWorkspaceId || data.companyId || COMPANY_ID,
    };
  }

  // Legacy / invited users under companies/{tenant}/users.
  // Do not probe the hard-coded COMPANY_ID path — that denies SaaS tenants
  // and floods the console with permission errors.
  return null;
}

export async function getCompanyUserProfile(
  uid: string,
  workspaceId?: string,
): Promise<AppUser | null> {
  const ws = tenantId(workspaceId);
  if (AUTH_BYPASS) return getUserProfile(uid);
  const snap = await getDoc(doc(getFirebaseDb(), usersPath(ws), uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...(snap.data() as Omit<AppUser, "uid">) };
}

/**
 * First Firebase Auth user to sign in (before setup meta exists)
 * becomes the company admin and locks further self-provisioning.
 * Prefer /api/onboarding for new public signups.
 */
export async function ensureBootstrapAdmin(input: {
  uid: string;
  email: string;
  displayName?: string;
}): Promise<AppUser | null> {
  if (AUTH_BYPASS) return DEMO_ADMIN;

  const existing = await getUserProfile(input.uid);
  if (existing) return existing;

  const setupRef = doc(getFirebaseDb(), setupMetaPath());
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
    defaultWorkspaceId: COMPANY_ID,
    onboardingComplete: false,
    projectIds: [],
    active: true,
    createdAt: now,
  };

  const payload = sanitizeForFirestore({
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    companyId: profile.companyId,
    defaultWorkspaceId: COMPANY_ID,
    onboardingComplete: false,
    projectIds: profile.projectIds,
    active: profile.active,
    createdAt: profile.createdAt,
    updatedAt: now,
  });

  await setDoc(doc(getFirebaseDb(), usersPath(), input.uid), payload);
  await setDoc(doc(getFirebaseDb(), accountUserPath(input.uid)), payload, {
    merge: true,
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
  workspaceId?: string,
) {
  const ws = tenantId(workspaceId || data.companyId);
  const ref = doc(getFirebaseDb(), usersPath(ws), uid);
  const existing = await getDoc(ref);
  const payload = sanitizeForFirestore({
    ...data,
    companyId: ws,
    projectIds: data.projectIds || [],
    active: data.active ?? true,
    updatedAt: new Date().toISOString(),
    ...(existing.exists() ? {} : { createdAt: new Date().toISOString() }),
  });
  await setDoc(ref, payload, { merge: true });
}

export async function listUsersByRole(
  role?: UserRole,
  workspaceId?: string,
) {
  const ws = tenantId(workspaceId);
  if (AUTH_BYPASS) {
    const users = [DEMO_ADMIN, DEMO_CLIENT];
    return role ? users.filter((u) => u.role === role) : users;
  }
  const snap = await getDocs(collection(getFirebaseDb(), usersPath(ws)));
  return snap.docs
    .map(
      (d) => ({ uid: d.id, ...(d.data() as Omit<AppUser, "uid">) }) as AppUser,
    )
    .filter((u) => (role ? u.role === role : true));
}

export async function setClientAccess(
  uid: string,
  active: boolean,
  workspaceId?: string,
) {
  if (AUTH_BYPASS) return;
  const ws = tenantId(workspaceId);
  await updateDoc(doc(getFirebaseDb(), usersPath(ws), uid), {
    active,
    updatedAt: new Date().toISOString(),
  });
}

export async function completeOnboardingClient(token: string, body?: {
  studioName?: string;
  displayName?: string;
  migrateLegacy?: boolean;
}) {
  const res = await fetch("/api/onboarding", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    workspaceId?: string;
    error?: string;
    alreadyComplete?: boolean;
  };
  if (!res.ok) {
    throw new Error(data.error || "Onboarding failed. Please try again.");
  }
  return data;
}
