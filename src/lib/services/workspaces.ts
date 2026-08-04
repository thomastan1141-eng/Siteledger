import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "../firebase";
import { AUTH_BYPASS } from "../demo";
import { COMPANY_ID } from "../constants";
import {
  workspaceMemberPath,
  workspacePath,
} from "../paths";
import type { Workspace, WorkspaceMember } from "../types";

export async function getWorkspace(
  workspaceId: string,
): Promise<Workspace | null> {
  if (AUTH_BYPASS) {
    return {
      id: COMPANY_ID,
      name: "Demo Studio",
      ownerUid: "demo-admin",
      plan: "FREE",
      subscriptionStatus: "NONE",
      trialStartsAt: null,
      trialEndsAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  const snap = await getDoc(doc(getFirebaseDb(), workspacePath(workspaceId)));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Workspace, "id">) };
}

export async function getWorkspaceMember(
  workspaceId: string,
  uid: string,
): Promise<WorkspaceMember | null> {
  if (AUTH_BYPASS) {
    return {
      uid,
      email: "admin@siteledger.demo",
      displayName: "Demo Admin",
      role: "OWNER",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
  }
  const snap = await getDoc(
    doc(getFirebaseDb(), workspaceMemberPath(workspaceId, uid)),
  );
  if (!snap.exists()) return null;
  return snap.data() as WorkspaceMember;
}
