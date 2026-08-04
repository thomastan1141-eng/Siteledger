import { getFirebaseAuth } from "../firebase";
import { AUTH_BYPASS } from "../demo";
import type { ColleaguePermissions, ColleaguePreset, InviteType } from "../types";

export type CreateInvitationInput = {
  workspaceId: string;
  projectId: string;
  inviteType: InviteType;
  email: string;
  displayName?: string;
  colleaguePreset?: ColleaguePreset;
  permissions?: Partial<ColleaguePermissions>;
};

export type CreateInvitationResult = {
  id: string;
  projectId: string;
  inviteType: InviteType;
  email: string;
  displayName: string | null;
  colleaguePreset: ColleaguePreset | null;
  status: string;
  expiresAt: string;
  inviteUrl: string;
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

/** Send a passwordless invitation for a client or colleague on a project. */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  if (AUTH_BYPASS) {
    const id = `demo-invite-${Date.now()}`;
    return {
      id,
      projectId: input.projectId,
      inviteType: input.inviteType,
      email: input.email.trim(),
      displayName: input.displayName?.trim() || null,
      colleaguePreset: input.inviteType === "COLLEAGUE" ? input.colleaguePreset || "VIEW_ONLY" : null,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      inviteUrl: `https://siteledger.work/invite/${id}`,
    };
  }

  if (!input.projectId.trim()) {
    throw new Error("A project assignment is required.");
  }
  if (!input.workspaceId.trim()) {
    throw new Error("Workspace is required.");
  }

  const res = await authedFetch("/api/invitations/create", {
    workspaceId: input.workspaceId.trim(),
    projectId: input.projectId.trim(),
    inviteType: input.inviteType,
    email: input.email.trim(),
    displayName: input.displayName?.trim() || null,
    colleaguePreset: input.inviteType === "COLLEAGUE" ? input.colleaguePreset || "VIEW_ONLY" : null,
    permissions:
      input.inviteType === "COLLEAGUE" && input.colleaguePreset === "CUSTOM"
        ? input.permissions
        : null,
  });

  const data = (await res.json()) as {
    ok?: boolean;
    invitation?: CreateInvitationResult;
    error?: string;
  };

  if (!res.ok || !data.invitation) {
    throw new Error(data.error || "We could not send the invitation. Please try again.");
  }

  return data.invitation;
}

/** Load active members and pending invitations for the whole workspace. Admins only. */
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

/** Revoke a pending invitation before it is accepted. */
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

/** Remove an already-accepted client or colleague from a project. */
export async function revokeMemberAccess(input: {
  workspaceId: string;
  projectId: string;
  uid: string;
}) {
  if (AUTH_BYPASS) return;
  const res = await authedFetch("/api/invitations/revoke", input);
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
