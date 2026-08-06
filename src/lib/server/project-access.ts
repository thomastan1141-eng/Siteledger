import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import {
  assertCanManageProjectAccess,
  normalizeEmail,
} from "@/lib/server/invitations";
import { writeAuditEvent } from "@/lib/server/audit";
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

export class ProjectAccessError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ProjectAccessError";
    this.status = status;
    this.code = code;
  }
}

export async function lookupShareableAuthUser(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ProjectAccessError("Enter a valid email.", 400, "invalid_email");
  }

  try {
    const user = await getAdminAuth().getUserByEmail(normalized);
    if (user.disabled) {
      throw new ProjectAccessError(
        "This SiteLedger account is disabled.",
        403,
        "disabled",
      );
    }
    if (!user.emailVerified) {
      throw new ProjectAccessError(
        "This SiteLedger account has not verified its email yet.",
        403,
        "unverified",
      );
    }
    return {
      uid: user.uid,
      email: user.email || normalized,
      displayName: user.displayName || null,
      emailVerified: true,
    };
  } catch (err) {
    if (err instanceof ProjectAccessError) throw err;
    const code =
      typeof err === "object" && err && "code" in err
        ? String((err as { code?: string }).code || "")
        : "";
    if (code === "auth/user-not-found") {
      throw new ProjectAccessError(
        "This email is not registered with SiteLedger.",
        404,
        "not_registered",
      );
    }
    throw err;
  }
}

function resolveColleaguePermissions(
  preset: ColleaguePreset | null | undefined,
  permissions?: Partial<ColleaguePermissions> | null,
) {
  const resolvedPreset = preset || "VIEW_ONLY";
  return {
    preset: resolvedPreset,
    permissions: mergePermissions(
      permissionsForPreset(resolvedPreset),
      permissions,
    ),
  };
}

/**
 * Immediate project share — no invitation token. Atomic member + array writes.
 */
export async function shareProjectAccess(input: {
  actorUid: string;
  workspaceId: string;
  projectId: string;
  email: string;
  inviteType: InviteType;
  displayName?: string | null;
  colleaguePreset?: ColleaguePreset | null;
  permissions?: Partial<ColleaguePermissions> | null;
}) {
  const workspaceId = input.workspaceId.trim();
  const projectId = input.projectId.trim();
  if (!workspaceId || !projectId) {
    throw new ProjectAccessError("Workspace and project are required.", 400);
  }
  if (input.inviteType !== "CLIENT" && input.inviteType !== "COLLEAGUE") {
    throw new ProjectAccessError("Share as Client or Colleague.", 400);
  }

  const projectSnap = await assertCanManageProjectAccess(
    input.actorUid,
    workspaceId,
    projectId,
  );
  const project = projectSnap.data() || {};
  const target = await lookupShareableAuthUser(input.email);

  if (target.uid === input.actorUid) {
    throw new ProjectAccessError(
      "You cannot share a project with your own account.",
      400,
      "self_share",
    );
  }
  if (project.createdBy && String(project.createdBy) === target.uid) {
    throw new ProjectAccessError(
      "The project owner already has access.",
      400,
      "owner_share",
    );
  }

  const db = getAdminDb();
  const memberRef = db.doc(
    `companies/${workspaceId}/projects/${projectId}/members/${target.uid}`,
  );
  const projectRef = db.doc(`companies/${workspaceId}/projects/${projectId}`);
  const companyUserRef = db.doc(`companies/${workspaceId}/users/${target.uid}`);
  const accountRef = db.doc(`users/${target.uid}`);

  const [memberSnap, companyUserSnap, accountSnap] = await Promise.all([
    memberRef.get(),
    companyUserRef.get(),
    accountRef.get(),
  ]);

  if (
    memberSnap.exists &&
    String(memberSnap.data()?.status || "") === "ACTIVE"
  ) {
    return {
      ok: true as const,
      alreadyShared: true as const,
      uid: target.uid,
      email: target.email,
      inviteType: input.inviteType,
      projectId,
      workspaceId,
    };
  }

  const now = new Date().toISOString();
  const displayName =
    input.displayName?.trim() ||
    target.displayName ||
    target.email.split("@")[0] ||
    target.email;

  const colleague =
    input.inviteType === "COLLEAGUE"
      ? resolveColleaguePermissions(input.colleaguePreset, input.permissions)
      : null;

  const memberType = input.inviteType === "CLIENT" ? "CLIENT" : "COLLEAGUE";
  const memberRole = input.inviteType === "CLIENT" ? "CLIENT" : "COLLEAGUE";
  const profileRole = input.inviteType === "CLIENT" ? "client" : "staff";

  const batch = db.batch();

  batch.set(
    memberRef,
    sanitizeForFirestore({
      uid: target.uid,
      workspaceId,
      projectId,
      displayName,
      email: target.email,
      role: memberRole,
      memberType,
      permissionPreset:
        input.inviteType === "CLIENT"
          ? "CLIENT"
          : colleague?.preset || "VIEW_ONLY",
      permissions: input.inviteType === "CLIENT" ? null : colleague?.permissions,
      status: "ACTIVE",
      invitedBy: input.actorUid,
      invitedAt: now,
      acceptedAt: now,
      createdBy: input.actorUid,
      createdAt: memberSnap.exists
        ? memberSnap.data()?.createdAt || now
        : now,
      updatedAt: now,
      sharedAt: now,
      sharedBy: input.actorUid,
    }),
    { merge: true },
  );

  const projectPatch: Record<string, unknown> = {
    updatedAt: now,
    workspaceId,
    companyId: workspaceId,
  };
  if (input.inviteType === "CLIENT") {
    projectPatch.clientUserIds = FieldValue.arrayUnion(target.uid);
    projectPatch.staffIds = FieldValue.arrayRemove(target.uid);
  } else {
    projectPatch.staffIds = FieldValue.arrayUnion(target.uid);
    projectPatch.clientUserIds = FieldValue.arrayRemove(target.uid);
  }
  batch.set(projectRef, projectPatch, { merge: true });

  const existingCompanyRole = companyUserSnap.exists
    ? String(companyUserSnap.data()?.role || "")
    : "";
  const companyRole =
    existingCompanyRole === "admin" ? "admin" : profileRole;

  batch.set(
    companyUserRef,
    sanitizeForFirestore({
      email: target.email,
      displayName,
      role: companyRole,
      companyId: workspaceId,
      projectIds: FieldValue.arrayUnion(projectId),
      active: true,
      onboardingComplete: true,
      updatedAt: now,
      ...(companyUserSnap.exists ? {} : { createdAt: now }),
    }),
    { merge: true },
  );

  // Never write emailVerified. Never overwrite defaultWorkspaceId/companyId/role
  // on an existing account — sharedWorkspaceIds drives cross-workspace discovery.
  const accountPatch: Record<string, unknown> = {
    email: target.email,
    displayName:
      (accountSnap.exists && accountSnap.data()?.displayName) || displayName,
    projectIds: FieldValue.arrayUnion(projectId),
    sharedWorkspaceIds: FieldValue.arrayUnion(workspaceId),
    active: accountSnap.exists
      ? accountSnap.data()?.active !== false
      : true,
    updatedAt: now,
  };
  if (!accountSnap.exists) {
    accountPatch.role = profileRole;
    accountPatch.companyId = workspaceId;
    accountPatch.defaultWorkspaceId = workspaceId;
    accountPatch.onboardingComplete = true;
    accountPatch.createdAt = now;
  } else if (String(accountSnap.data()?.role || "") !== "admin") {
    // Keep their home workspace; only ensure onboarding is complete for shared use.
    accountPatch.onboardingComplete = true;
  }
  batch.set(accountRef, sanitizeForFirestore(accountPatch), { merge: true });

  await batch.commit();

  await writeAuditEvent({
    workspaceId,
    projectId,
    action: "PROJECT_MEMBER_SHARED",
    performedBy: input.actorUid,
    affectedUserId: target.uid,
    newValue: {
      inviteType: input.inviteType,
      email: normalizeEmail(target.email),
      source: "direct_share",
    },
  });

  return {
    ok: true as const,
    alreadyShared: false as const,
    uid: target.uid,
    email: target.email,
    inviteType: input.inviteType,
    projectId,
    workspaceId,
  };
}

/**
 * Immediately revoke every project access reference for a member.
 */
export async function revokeProjectAccess(input: {
  actorUid: string;
  workspaceId: string;
  projectId: string;
  uid: string;
}) {
  const workspaceId = input.workspaceId.trim();
  const projectId = input.projectId.trim();
  const uid = input.uid.trim();
  if (!workspaceId || !projectId || !uid) {
    throw new ProjectAccessError(
      "Workspace, project, and user are required.",
      400,
    );
  }

  await assertCanManageProjectAccess(input.actorUid, workspaceId, projectId);

  const db = getAdminDb();
  const memberRef = db.doc(
    `companies/${workspaceId}/projects/${projectId}/members/${uid}`,
  );
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    throw new ProjectAccessError("Member not found.", 404, "not_found");
  }
  const memberData = memberSnap.data() || {};
  if (
    memberData.memberType === "OWNER" ||
    memberData.permissionPreset === "OWNER"
  ) {
    throw new ProjectAccessError(
      "The project owner cannot be revoked.",
      400,
      "owner_revoke",
    );
  }

  const now = new Date().toISOString();
  const companyUserRef = db.doc(`companies/${workspaceId}/users/${uid}`);
  const accountRef = db.doc(`users/${uid}`);
  const [companyUserSnap, accountSnap] = await Promise.all([
    companyUserRef.get(),
    accountRef.get(),
  ]);

  const batch = db.batch();
  batch.set(
    memberRef,
    {
      status: "REMOVED",
      updatedAt: FieldValue.serverTimestamp(),
      revokedAt: now,
      revokedBy: input.actorUid,
    },
    { merge: true },
  );
  batch.set(
    db.doc(`companies/${workspaceId}/projects/${projectId}`),
    {
      clientUserIds: FieldValue.arrayRemove(uid),
      staffIds: FieldValue.arrayRemove(uid),
      updatedAt: now,
    },
    { merge: true },
  );

  if (companyUserSnap.exists) {
    const projectIds = Array.isArray(companyUserSnap.data()?.projectIds)
      ? (companyUserSnap.data()?.projectIds as string[]).filter(
          (id) => id !== projectId,
        )
      : [];
    batch.set(
      companyUserRef,
      {
        projectIds,
        updatedAt: now,
      },
      { merge: true },
    );

    if (accountSnap.exists) {
      const accountProjectIds = Array.isArray(accountSnap.data()?.projectIds)
        ? (accountSnap.data()?.projectIds as string[]).filter(
            (id) => id !== projectId,
          )
        : [];
      const accountPatch: Record<string, unknown> = {
        projectIds: accountProjectIds,
        updatedAt: now,
      };
      // Drop shared workspace index when no remaining projects under this tenant.
      if (projectIds.length === 0) {
        accountPatch.sharedWorkspaceIds = FieldValue.arrayRemove(workspaceId);
      }
      batch.set(accountRef, accountPatch, { merge: true });
    }
  } else if (accountSnap.exists) {
    const accountProjectIds = Array.isArray(accountSnap.data()?.projectIds)
      ? (accountSnap.data()?.projectIds as string[]).filter(
          (id) => id !== projectId,
        )
      : [];
    batch.set(
      accountRef,
      {
        projectIds: accountProjectIds,
        sharedWorkspaceIds: FieldValue.arrayRemove(workspaceId),
        updatedAt: now,
      },
      { merge: true },
    );
  }

  await batch.commit();

  await writeAuditEvent({
    workspaceId,
    projectId,
    action: "PROJECT_MEMBER_REMOVED",
    performedBy: input.actorUid,
    affectedUserId: uid,
    newValue: { source: "direct_unshare" },
  });

  return { ok: true as const };
}
