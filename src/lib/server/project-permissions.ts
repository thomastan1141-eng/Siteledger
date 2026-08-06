import { getAdminDb } from "@/lib/firebase-admin";
import { permissionsForPreset } from "@/lib/permissions";
import type { ColleaguePermissions, ColleaguePreset } from "@/lib/types";

export type MediaAction =
  | "VIEW_MEDIA"
  | "UPLOAD_MEDIA"
  | "EDIT_MEDIA"
  | "DELETE_MEDIA"
  | "PUBLISH_TO_CLIENT";

export type ProjectPermissionContext = {
  uid: string;
  workspaceId: string;
  projectId: string;
  role: "admin" | "staff" | "client" | "owner" | "none";
  isStaffAssigned: boolean;
  isClientAssigned: boolean;
  allowStaffPublish: boolean;
  memberStatus: string | null;
  permissionPreset: string | null;
  permissions: Partial<ColleaguePermissions> | null;
  isActiveMember: boolean;
};

async function loadProjectPermissionContext(
  uid: string,
  projectId: string,
  workspaceIdHint?: string,
): Promise<ProjectPermissionContext> {
  const db = getAdminDb();

  let workspaceId = (workspaceIdHint || "").trim();
  let projectSnap = workspaceId
    ? await db.doc(`companies/${workspaceId}/projects/${projectId}`).get()
    : null;

  if (!projectSnap?.exists) {
    const account = await db.doc(`users/${uid}`).get();
    const shared = Array.isArray(account.data()?.sharedWorkspaceIds)
      ? account.data()!.sharedWorkspaceIds.map(String)
      : [];
    const fallbackWs =
      String(account.data()?.defaultWorkspaceId || "") ||
      String(account.data()?.companyId || "") ||
      "siteledger";
    const candidates = Array.from(
      new Set([workspaceId, fallbackWs, ...shared, "siteledger"].filter(Boolean)),
    );
    for (const ws of candidates) {
      const snap = await db.doc(`companies/${ws}/projects/${projectId}`).get();
      if (snap.exists) {
        workspaceId = ws;
        projectSnap = snap;
        break;
      }
    }
  }

  if (!projectSnap?.exists || !workspaceId) {
    throw Object.assign(new Error("Project not found."), { status: 404 });
  }

  const project = projectSnap.data() || {};
  const staffIds: string[] = Array.isArray(project.staffIds)
    ? project.staffIds.map(String)
    : [];
  const clientUserIds: string[] = Array.isArray(project.clientUserIds)
    ? project.clientUserIds.map(String)
    : [];
  const allowStaffPublish = Boolean(project.allowStaffPublish);

  const [companyUser, account, workspaceMember, projectMember] =
    await Promise.all([
      db.doc(`companies/${workspaceId}/users/${uid}`).get(),
      db.doc(`users/${uid}`).get(),
      db.doc(`workspaces/${workspaceId}/members/${uid}`).get(),
      db
        .doc(`companies/${workspaceId}/projects/${projectId}/members/${uid}`)
        .get(),
    ]);

  const memberData = projectMember.exists ? projectMember.data() || {} : null;
  const memberStatus = memberData ? String(memberData.status || "") : null;
  const isActiveMember = memberStatus === "ACTIVE";
  const inStaffIds = staffIds.includes(uid);
  const inClientIds = clientUserIds.includes(uid);
  const isCreator = project.createdBy === uid;
  // Dual gate for shared users: array index AND ACTIVE member.
  // Project creators retain access without a member row.
  const isStaffAssigned = (inStaffIds && isActiveMember) || isCreator;
  const isClientAssigned = inClientIds && isActiveMember;

  const isOwner =
    workspaceMember.exists &&
    workspaceMember.data()?.role === "OWNER" &&
    workspaceMember.data()?.status === "ACTIVE";
  const isAdmin =
    (companyUser.exists &&
      companyUser.data()?.role === "admin" &&
      companyUser.data()?.active !== false) ||
    (account.exists &&
      account.data()?.role === "admin" &&
      (account.data()?.defaultWorkspaceId === workspaceId ||
        account.data()?.companyId === workspaceId));
  const companyRole = companyUser.exists
    ? String(companyUser.data()?.role || "")
    : "";
  const isStaff =
    companyUser.exists &&
    companyRole === "staff" &&
    companyUser.data()?.active !== false;
  const isClient =
    companyUser.exists &&
    companyRole === "client" &&
    companyUser.data()?.active !== false;

  let role: ProjectPermissionContext["role"] = "none";
  if (isOwner || isAdmin) role = isOwner ? "owner" : "admin";
  else if (isStaff) role = "staff";
  else if (isClient) role = "client";

  const permissionPreset = memberData
    ? (memberData.permissionPreset as string) || null
    : null;
  const rawPermissions =
    memberData &&
    memberData.permissions &&
    typeof memberData.permissions === "object"
      ? (memberData.permissions as Partial<ColleaguePermissions>)
      : null;
  const permissions =
    rawPermissions ||
    (permissionPreset &&
    permissionPreset !== "CLIENT" &&
    permissionPreset !== "OWNER"
      ? permissionsForPreset(permissionPreset as ColleaguePreset)
      : permissionPreset === "OWNER"
        ? permissionsForPreset("EDITOR")
        : null);

  return {
    uid,
    workspaceId,
    projectId,
    role,
    isStaffAssigned,
    isClientAssigned,
    allowStaffPublish,
    memberStatus,
    permissionPreset,
    permissions,
    isActiveMember,
  };
}

function colleagueAllows(
  ctx: ProjectPermissionContext,
  key: keyof ColleaguePermissions,
) {
  if (ctx.permissionPreset === "OWNER") return true;
  if (ctx.permissions?.[key] === true) return true;
  return false;
}

function canManage(ctx: ProjectPermissionContext) {
  return ctx.role === "owner" || ctx.role === "admin";
}

function isActiveAssignedStaff(ctx: ProjectPermissionContext) {
  if (canManage(ctx)) return true;
  if (ctx.role !== "staff") return false;
  // Creator retains manage-equivalent media access for their projects.
  if (ctx.isStaffAssigned) return true;
  return false;
}

export async function assertProjectPermission(input: {
  uid: string;
  projectId: string;
  action: MediaAction;
  workspaceId?: string;
  clientVisible?: boolean;
  uploadedBy?: string | null;
}): Promise<ProjectPermissionContext> {
  const ctx = await loadProjectPermissionContext(
    input.uid,
    input.projectId,
    input.workspaceId,
  );

  const canManageAll = canManage(ctx);
  const canStaffAccess = isActiveAssignedStaff(ctx);
  const canClientView = ctx.role === "client" && ctx.isClientAssigned;
  const isOwn =
    Boolean(input.uploadedBy) && input.uploadedBy === input.uid;

  switch (input.action) {
    case "VIEW_MEDIA": {
      if (canManageAll) return ctx;
      if (canStaffAccess && colleagueAllows(ctx, "viewMedia")) return ctx;
      if (canStaffAccess && canManageAll) return ctx;
      if (canClientView) return ctx;
      // Creator path: isStaffAssigned true via createdBy without colleague perms map
      if (canStaffAccess && ctx.permissionPreset == null && ctx.memberStatus == null)
        return ctx;
      break;
    }
    case "UPLOAD_MEDIA": {
      if (canManageAll) return ctx;
      if (canStaffAccess && colleagueAllows(ctx, "uploadMedia")) return ctx;
      if (canStaffAccess && ctx.permissionPreset == null && ctx.memberStatus == null)
        return ctx;
      break;
    }
    case "EDIT_MEDIA": {
      if (canManageAll) return ctx;
      if (canStaffAccess && colleagueAllows(ctx, "editAllMedia")) return ctx;
      if (canStaffAccess && isOwn && colleagueAllows(ctx, "editOwnMedia"))
        return ctx;
      if (canStaffAccess && ctx.permissionPreset == null && ctx.memberStatus == null)
        return ctx;
      break;
    }
    case "DELETE_MEDIA": {
      if (canManageAll) return ctx;
      if (canStaffAccess && colleagueAllows(ctx, "deleteAllMedia")) return ctx;
      if (canStaffAccess && isOwn && colleagueAllows(ctx, "deleteOwnMedia"))
        return ctx;
      break;
    }
    case "PUBLISH_TO_CLIENT": {
      if (canManageAll) return ctx;
      if (
        canStaffAccess &&
        ctx.allowStaffPublish &&
        colleagueAllows(ctx, "publishMediaToClient")
      ) {
        return ctx;
      }
      if (
        canStaffAccess &&
        ctx.allowStaffPublish &&
        ctx.permissionPreset == null &&
        ctx.memberStatus == null
      ) {
        return ctx;
      }
      break;
    }
    default:
      break;
  }

  throw Object.assign(
    new Error(
      input.action === "UPLOAD_MEDIA"
        ? "You do not have permission to upload videos to this project."
        : input.action === "DELETE_MEDIA"
          ? "You do not have permission to delete this video."
          : "You do not have access to this video.",
    ),
    { status: 403 },
  );
}

export async function assertClientVisibleAllowed(
  ctx: ProjectPermissionContext,
  clientVisible: boolean,
) {
  if (!clientVisible) return;
  if (canManage(ctx)) return;
  if (
    ctx.role === "staff" &&
    ctx.allowStaffPublish &&
    (colleagueAllows(ctx, "publishMediaToClient") ||
      (ctx.memberStatus == null && ctx.isStaffAssigned))
  ) {
    return;
  }
  throw Object.assign(
    new Error("You do not have permission to publish client-visible media."),
    { status: 403 },
  );
}
