import { getFirebaseAuth } from "../firebase";
import { AUTH_BYPASS } from "../demo";
import type { UserRole } from "../types";

export async function createProjectAccess(input: {
  email: string;
  password: string;
  displayName: string;
  role: Extract<UserRole, "client" | "staff">;
  projectId: string;
  workspaceId: string;
}) {
  if (AUTH_BYPASS) {
    return {
      uid: `demo-${input.role}-${Date.now()}`,
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      projectId: input.projectId,
    };
  }

  if (!input.projectId.trim()) {
    throw new Error("A project assignment is required.");
  }

  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("Please sign in again.");
  const token = await current.getIdToken(true);

  const res = await fetch("/api/access/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
      displayName: input.displayName.trim(),
      role: input.role,
      projectId: input.projectId.trim(),
      workspaceId: input.workspaceId.trim(),
    }),
  });

  const data = (await res.json()) as {
    ok?: boolean;
    uid?: string;
    email?: string;
    displayName?: string;
    role?: string;
    projectId?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || "We could not create access. Please try again.");
  }

  return {
    uid: data.uid || "",
    email: data.email || input.email,
    displayName: data.displayName || input.displayName,
    role: (data.role || input.role) as "client" | "staff",
    projectId: data.projectId || input.projectId,
  };
}

/** @deprecated use createProjectAccess */
export async function inviteUser(input: {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  projectIds?: string[];
  workspaceId?: string;
}) {
  if (input.role !== "client" && input.role !== "staff") {
    throw new Error("Only Client or Staff access can be created here.");
  }
  const projectId = input.projectIds?.[0] || "";
  if (!projectId) throw new Error("A project assignment is required.");
  if (!input.workspaceId) throw new Error("Workspace is required.");
  return createProjectAccess({
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    role: input.role,
    projectId,
    workspaceId: input.workspaceId,
  });
}

export async function revokeProjectAccess(input: {
  uid: string;
  workspaceId: string;
  projectId?: string;
}) {
  if (AUTH_BYPASS) return;
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("Please sign in again.");
  const token = await current.getIdToken(true);
  const res = await fetch("/api/access/revoke", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "We could not revoke access. Please try again.");
  }
}

export async function clearMustChangePasswordFlag(workspaceId?: string) {
  if (AUTH_BYPASS) return;
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("Please sign in again.");
  const token = await current.getIdToken(true);
  const res = await fetch("/api/access/clear-password-flag", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspaceId: workspaceId || "" }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error || "We could not update your password status.");
  }
}
