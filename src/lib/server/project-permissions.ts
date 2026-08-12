import { getAdminDb } from "@/lib/firebase-admin";
import {
  resolveEffectivePermissions,
  resolveProjectForUser,
} from "@/lib/server/project-directory";
import type { ColleaguePermissions } from "@/lib/types";

export type MediaAction =
  | "VIEW_MEDIA"
  | "DOWNLOAD_MEDIA"
  | "UPLOAD_MEDIA"
  | "EDIT_MEDIA"
  | "DELETE_MEDIA"
  | "PUBLISH_TO_CLIENT";

export type ProjectPermissionContext = {
  uid: string;
  workspaceId: string;
  projectId: string;
  /** Project-scoped access kind — not users/{uid}.role, company admin, or
   *  workspace owner. "owner" here means the Project creator only. */
  role: "staff" | "client" | "owner" | "none";
  isStaffAssigned: boolean;
  isClientAssigned: boolean;
  allowStaffPublish: boolean;
  memberStatus: string | null;
  memberType: string | null;
  permissionPreset: string | null;
  permissions: Partial<ColleaguePermissions> | null;
  isActiveMember: boolean;
  isCreator: boolean;
};

export function isMediaClientVisible(
  media: Record<string, unknown>,
): boolean {
  return (
    media.clientVisible === true ||
    media.visibility === "client_visible" ||
    media.visibility === "handover"
  );
}

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

  // Never guess the workspace from the caller's defaultWorkspaceId/
  // sharedWorkspaceIds/companyId profile fields — that bypasses the real
  // ownership/ACTIVE-membership check and can cross-wire two workspaces
  // that happen to reuse a projectId. Instead, resolve the exact Project
  // the USER is authorized for (creator OR ACTIVE member), the same
  // authoritative lookup the Projects list and /api/projects/resolve use.
  if (!projectSnap?.exists) {
    const resolved = await resolveProjectForUser(uid, projectId, workspaceId || undefined);
    if (resolved) {
      workspaceId = resolved.workspaceId;
      projectSnap = await db
        .doc(`companies/${workspaceId}/projects/${projectId}`)
        .get();
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

  const projectMember = await db
    .doc(`companies/${workspaceId}/projects/${projectId}/members/${uid}`)
    .get();

  const memberData = projectMember.exists ? projectMember.data() || {} : null;
  const memberStatus = memberData ? String(memberData.status || "") : null;
  const memberType = memberData ? String(memberData.memberType || "") : null;
  const isActiveMember = memberStatus === "ACTIVE";
  const inStaffIds = staffIds.includes(uid);
  const inClientIds = clientUserIds.includes(uid);
  const isCreator = project.createdBy === uid;
  // Dual gate for shared users: array index AND ACTIVE member.
  // Project creators retain access without relying on users.role.
  const isStaffAssigned = (inStaffIds && isActiveMember) || isCreator;
  const isClientAssigned =
    inClientIds && isActiveMember && memberType === "CLIENT";

  // The Project creator is the sole "owner". Company admin and workspace
  // owner grant no Project authority — never checked here.
  let role: ProjectPermissionContext["role"] = "none";
  if (isCreator) role = "owner";
  else if (isStaffAssigned && memberType !== "CLIENT") role = "staff";
  else if (isClientAssigned) role = "client";

  const permissionPreset = memberData
    ? (memberData.permissionPreset as string) || null
    : null;
  const accessLevel = memberData
    ? (memberData.accessLevel as string) || null
    : null;
  const rawPermissions =
    memberData &&
    memberData.permissions &&
    typeof memberData.permissions === "object"
      ? (memberData.permissions as Record<string, unknown>)
      : null;
  // Single source of truth for accessLevel/preset -> permission-map resolution
  // (also used by project-directory.ts for the Projects list / resolve API).
  const permissions = isCreator
    ? null
    : resolveEffectivePermissions({
        isOwner: false,
        memberType,
        accessLevel,
        permissionPreset,
        permissions: rawPermissions,
      });

  return {
    uid,
    workspaceId,
    projectId,
    role,
    isStaffAssigned,
    isClientAssigned,
    allowStaffPublish,
    memberStatus,
    memberType,
    permissionPreset,
    permissions,
    isActiveMember,
    isCreator,
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

// Only the Project creator has full control. Company admin, workspace
// owner and a colleague's OWNER-preset membership (which only the creator's
// own record uses) never substitute for creator identity here.
function canManage(ctx: ProjectPermissionContext) {
  return ctx.isCreator;
}

function isActiveAssignedColleague(ctx: ProjectPermissionContext) {
  if (canManage(ctx)) return true;
  if (!ctx.isStaffAssigned || ctx.memberType === "CLIENT") return false;
  return true;
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
  const canColleagueAccess = isActiveAssignedColleague(ctx);
  const canClientView = ctx.isClientAssigned;
  const isOwn =
    Boolean(input.uploadedBy) && input.uploadedBy === input.uid;

  switch (input.action) {
    case "VIEW_MEDIA": {
      if (canManageAll) return ctx;
      if (canColleagueAccess && colleagueAllows(ctx, "viewMedia")) return ctx;
      if (canClientView) return ctx;
      // Creator without a colleague permission map
      if (ctx.isCreator) return ctx;
      break;
    }
    case "DOWNLOAD_MEDIA": {
      if (canManageAll) return ctx;
      if (canColleagueAccess && colleagueAllows(ctx, "downloadMedia")) {
        return ctx;
      }
      if (canClientView) return ctx;
      break;
    }
    case "UPLOAD_MEDIA": {
      if (canManageAll) return ctx;
      if (canColleagueAccess && colleagueAllows(ctx, "uploadMedia")) return ctx;
      if (ctx.isCreator) return ctx;
      break;
    }
    case "EDIT_MEDIA": {
      if (canManageAll) return ctx;
      if (canColleagueAccess && colleagueAllows(ctx, "editAllMedia")) return ctx;
      if (canColleagueAccess && isOwn && colleagueAllows(ctx, "editOwnMedia"))
        return ctx;
      if (ctx.isCreator) return ctx;
      break;
    }
    case "DELETE_MEDIA": {
      if (canManageAll) return ctx;
      if (canColleagueAccess && colleagueAllows(ctx, "deleteAllMedia"))
        return ctx;
      if (canColleagueAccess && isOwn && colleagueAllows(ctx, "deleteOwnMedia"))
        return ctx;
      break;
    }
    case "PUBLISH_TO_CLIENT": {
      if (canManageAll) return ctx;
      if (
        canColleagueAccess &&
        ctx.allowStaffPublish &&
        colleagueAllows(ctx, "publishMediaToClient")
      ) {
        return ctx;
      }
      if (ctx.isCreator && ctx.allowStaffPublish) return ctx;
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
          ? "You do not have permission to delete this media."
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
    ctx.isStaffAssigned &&
    ctx.memberType !== "CLIENT" &&
    ctx.allowStaffPublish &&
    (colleagueAllows(ctx, "publishMediaToClient") || ctx.isCreator)
  ) {
    return;
  }
  throw Object.assign(
    new Error("You do not have permission to publish media to the client."),
    { status: 403 },
  );
}
