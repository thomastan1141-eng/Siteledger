import { getFirebaseAuth } from "../firebase";
import { AUTH_BYPASS } from "../demo";
import type { ColleaguePermissions, ColleaguePreset, InviteType } from "../types";

export type ShareProjectInput = {
  workspaceId: string;
  projectId: string;
  inviteType: InviteType;
  email: string;
  displayName?: string;
  colleaguePreset?: ColleaguePreset;
  permissions?: Partial<ColleaguePermissions>;
};

export type ShareProjectResult = {
  ok: true;
  alreadyShared: boolean;
  uid: string;
  email: string;
  inviteType: InviteType;
  projectId: string;
  workspaceId: string;
};

export type WorkspaceMemberSummary = {
  uid: string;
  projectId: string;
  projectTitle: string;
  displayName: string | null;
  email: string;
  memberType: string;
  permissionPreset: string | null;
  status: string;
  invitedAt: string | null;
  acceptedAt: string | null;
};

export type PendingInvitationSummary = {
  id: string;
  projectId: string;
  projectTitle: string;
  inviteType: InviteType;
  email: string;
  displayName: string | null;
  colleaguePreset: ColleaguePreset | null;
  status: string;
  invitedAt: string;
  expiresAt: string;
};

async function authedFetch(path: string, body: Record<string, unknown>) {
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("Please sign in again.");
  const token = await current.getIdToken();
  return fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Share a project immediately with an existing verified SiteLedger account. */
export async function shareProjectAccess(
  input: ShareProjectInput,
): Promise<ShareProjectResult> {
  if (AUTH_BYPASS) {
    return {
      ok: true,
      alreadyShared: false,
      uid: "demo-share",
      email: input.email.trim(),
      inviteType: input.inviteType,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
    };
  }

  if (!input.projectId.trim()) {
    throw new Error("A project assignment is required.");
  }
  if (!input.workspaceId.trim()) {
    throw new Error("Workspace is required.");
  }

  const res = await authedFetch("/api/access/share", {
    workspaceId: input.workspaceId.trim(),
    projectId: input.projectId.trim(),
    inviteType: input.inviteType,
    email: input.email.trim(),
    displayName: input.displayName?.trim() || null,
    colleaguePreset:
      input.inviteType === "COLLEAGUE"
        ? input.colleaguePreset || "VIEW_ONLY"
        : null,
    permissions:
      input.inviteType === "COLLEAGUE" && input.colleaguePreset === "CUSTOM"
        ? input.permissions
        : null,
  });

  const data = (await res.json()) as ShareProjectResult & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || "We could not share this project.");
  }

  return data;
}

/** @deprecated Use shareProjectAccess */
export async function createInvitation(input: ShareProjectInput) {
  const result = await shareProjectAccess(input);
  return {
    id: result.uid,
    projectId: result.projectId,
    inviteType: result.inviteType,
    email: result.email,
    displayName: input.displayName?.trim() || null,
    colleaguePreset:
      input.inviteType === "COLLEAGUE"
        ? input.colleaguePreset || "VIEW_ONLY"
        : null,
    status: "ACTIVE",
    expiresAt: "",
    inviteUrl: "",
  };
}

/** Load active members and legacy pending invitations for the workspace. */
export async function listWorkspaceInvitations(workspaceId: string): Promise<{
  members: WorkspaceMemberSummary[];
  pendingInvitations: PendingInvitationSummary[];
}> {
  if (AUTH_BYPASS || !workspaceId.trim()) {
    return { members: [], pendingInvitations: [] };
  }

  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("Please sign in again.");
  const token = await current.getIdToken();

  const res = await fetch(
    `/api/invitations/list?workspaceId=${encodeURIComponent(workspaceId.trim())}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const data = (await res.json()) as {
    ok?: boolean;
    members?: WorkspaceMemberSummary[];
    pendingInvitations?: PendingInvitationSummary[];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error || "We could not load access for this workspace.");
  }

  return {
    members: data.members || [],
    pendingInvitations: data.pendingInvitations || [],
  };
}

/** Revoke a legacy pending invitation (migration cleanup). */
export async function revokeInvitation(input: {
  workspaceId: string;
  projectId: string;
  invitationId: string;
}) {
  if (AUTH_BYPASS) return;
  const res = await authedFetch("/api/invitations/revoke", input);
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "We could not revoke this invitation.");
  }
}

/** Remove shared access immediately. */
export async function revokeMemberAccess(input: {
  workspaceId: string;
  projectId: string;
  uid: string;
}) {
  if (AUTH_BYPASS) return;
  const res = await authedFetch("/api/access/unshare", input);
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "We could not revoke this access.");
  }
}

export async function clearMustChangePasswordFlag(workspaceId?: string) {
  if (AUTH_BYPASS) return;
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("Please sign in again.");
  const token = await current.getIdToken();
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

/** Active shared users excluding the project owner membership. */
export function countSharedUsers(project: {
  staffIds?: string[] | null;
  clientUserIds?: string[] | null;
  createdBy?: string | null;
}) {
  const staff = new Set(project.staffIds || []);
  const clients = new Set(project.clientUserIds || []);
  if (project.createdBy) staff.delete(project.createdBy);
  return staff.size + clients.size;
}
