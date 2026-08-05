import { getAdminDb } from "@/lib/firebase-admin";

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
    // Resolve workspace from account default, then legacy siteledger.
    const account = await db.doc(`users/${uid}`).get();
    const fallbackWs =
      String(account.data()?.defaultWorkspaceId || "") ||
      String(account.data()?.companyId || "") ||
      "siteledger";
    const candidates = Array.from(
      new Set([workspaceId, fallbackWs, "siteledger"].filter(Boolean)),
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
  const isStaffAssigned =
    staffIds.includes(uid) || project.managerId === uid;
  const isClientAssigned = clientUserIds.includes(uid);

  const [companyUser, account, member] = await Promise.all([
    db.doc(`companies/${workspaceId}/users/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`workspaces/${workspaceId}/members/${uid}`).get(),
  ]);

  const isOwner =
    member.exists &&
    member.data()?.role === "OWNER" &&
    member.data()?.status === "ACTIVE";
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

  return {
    uid,
    workspaceId,
    projectId,
    role,
    isStaffAssigned,
    isClientAssigned,
    allowStaffPublish,
  };
}

export async function assertProjectPermission(input: {
  uid: string;
  projectId: string;
  action: MediaAction;
  workspaceId?: string;
  clientVisible?: boolean;
}): Promise<ProjectPermissionContext> {
  const ctx = await loadProjectPermissionContext(
    input.uid,
    input.projectId,
    input.workspaceId,
  );

  const canManageAll = ctx.role === "owner" || ctx.role === "admin";
  // Any active staff-side workspace member gets blanket project access,
  // consistent with Firestore Rules' canAccessTenant() and every other
  // sub-resource (schedule, journal, purchases, etc.). Requiring an
  // explicit staffIds/managerId match here was the same class of bug
  // that made Schedule/Media unusable for staff before it was fixed in
  // firestore.rules — do not reintroduce it.
  const canStaffAccess = ctx.role === "staff";
  const canClientView =
    ctx.role === "client" && ctx.isClientAssigned;

  switch (input.action) {
    case "VIEW_MEDIA": {
      if (canManageAll || canStaffAccess || canClientView) return ctx;
      break;
    }
    case "UPLOAD_MEDIA":
    case "EDIT_MEDIA": {
      if (canManageAll || canStaffAccess) return ctx;
      break;
    }
    case "DELETE_MEDIA": {
      // Staff cannot delete unless they are admin/owner.
      if (canManageAll) return ctx;
      break;
    }
    case "PUBLISH_TO_CLIENT": {
      if (canManageAll) return ctx;
      if (canStaffAccess && ctx.allowStaffPublish) return ctx;
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
  if (ctx.role === "owner" || ctx.role === "admin") return;
  if (ctx.role === "staff" && ctx.allowStaffPublish) return;
  throw Object.assign(
    new Error("You do not have permission to publish client-visible media."),
    { status: 403 },
  );
}
