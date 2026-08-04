import "server-only";

import { createHash, randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  mergePermissions,
  permissionsForPreset,
} from "@/lib/permissions";
import { sanitizeForFirestore } from "@/lib/sanitize";
import type {
  ColleaguePermissions,
  ColleaguePreset,
  InviteType,
} from "@/lib/types";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashInviteToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function generateInviteToken() {
  return randomBytes(32).toString("base64url");
}

export async function createInvitationRecord(input: {
  workspaceId: string;
  projectId: string;
  inviteType: InviteType;
  email: string;
  displayName?: string | null;
  colleaguePreset?: ColleaguePreset | null;
  permissions?: Partial<ColleaguePermissions> | null;
  invitedBy: string;
  expiresInDays?: number;
}) {
  const db = getAdminDb();
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const now = new Date();
  const expires = new Date(
    now.getTime() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000,
  );
  const normalizedEmail = normalizeEmail(input.email);
  const preset =
    input.inviteType === "COLLEAGUE"
      ? input.colleaguePreset || "VIEW_ONLY"
      : null;
  const permissions =
    input.inviteType === "COLLEAGUE"
      ? mergePermissions(
          permissionsForPreset(preset || "VIEW_ONLY"),
          input.permissions,
        )
      : null;

  const ref = db
    .collection(
      `companies/${input.workspaceId}/projects/${input.projectId}/invitations`,
    )
    .doc();

  const record = sanitizeForFirestore({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    inviteType: input.inviteType,
    email: input.email.trim(),
    normalizedEmail,
    displayName: input.displayName?.trim() || null,
    colleaguePreset: preset,
    permissions,
    status: "PENDING",
    tokenHash,
    invitedBy: input.invitedBy,
    invitedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
  });

  await ref.set({
    ...record,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    id: ref.id,
    ...record,
    rawToken,
    inviteUrl: `https://siteledger.work/invite/${rawToken}`,
  };
}

/**
 * True workspace-level admin check — top-level SaaS admin account, company
 * admin mirror, or an active OWNER/ADMIN workspace member.
 */
export async function assertWorkspaceAdmin(uid: string, workspaceId: string) {
  const db = getAdminDb();
  const [account, companyUser, member] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`companies/${workspaceId}/users/${uid}`).get(),
    db.doc(`workspaces/${workspaceId}/members/${uid}`).get(),
  ]);

  const a = account.data();
  if (
    a?.role === "admin" &&
    a?.active === true &&
    (a.defaultWorkspaceId === workspaceId || a.companyId === workspaceId)
  ) {
    return;
  }

  const cu = companyUser.data();
  if (companyUser.exists && cu?.role === "admin" && cu?.active !== false) {
    return;
  }

  const m = member.data();
  if (
    member.exists &&
    m?.status === "ACTIVE" &&
    (m?.role === "OWNER" || m?.role === "ADMIN")
  ) {
    return;
  }

  throw Object.assign(new Error("Forbidden"), { status: 403 });
}

/**
 * Project-level access-management check — the project creator, a member with
 * manageProjectAccess/OWNER permissions, or any workspace admin.
 */
export async function assertCanManageProjectAccess(
  uid: string,
  workspaceId: string,
  projectId: string,
) {
  const db = getAdminDb();
  const project = await db
    .doc(`companies/${workspaceId}/projects/${projectId}`)
    .get();
  if (!project.exists) {
    throw Object.assign(new Error("Project not found."), { status: 404 });
  }
  const data = project.data() || {};
  if (data.status === "trashed" || data.status === "purging") {
    throw Object.assign(new Error("Project is not available."), {
      status: 403,
    });
  }
  if (data.createdBy === uid) return project;

  const member = await db
    .doc(`companies/${workspaceId}/projects/${projectId}/members/${uid}`)
    .get();
  const m = member.data();
  if (
    member.exists &&
    m?.status === "ACTIVE" &&
    (m?.memberType === "OWNER" ||
      m?.permissions?.manageProjectAccess === true ||
      m?.permissionPreset === "OWNER")
  ) {
    return project;
  }

  await assertWorkspaceAdmin(uid, workspaceId);
  return project;
}

export async function findInvitationByRawToken(rawToken: string) {
  const tokenHash = hashInviteToken(rawToken);
  const snap = await getAdminDb()
    .collectionGroup("invitations")
    .where("tokenHash", "==", tokenHash)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return {
    id: doc.id,
    ref: doc.ref,
    data: doc.data() as Record<string, unknown>,
  };
}
