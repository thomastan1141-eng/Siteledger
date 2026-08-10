import "server-only";

import { getAdminDb } from "@/lib/firebase-admin";
import {
  EMPTY_COLLEAGUE_PERMISSIONS,
  OWNER_PERMISSIONS,
  accessLevelToLegacyPreset,
  mergePermissions,
  permissionsForPreset,
  resolveAccessLevel,
} from "@/lib/permissions";
import type {
  ColleaguePermissions,
  ColleaguePreset,
  Project,
  ProjectAccessLevel,
  ProjectStatus,
} from "@/lib/types";

/**
 * Normalize a member record into one concrete effectivePermissions map —
 * the single source of truth used by Journal, Schedule, Media, Purchases
 * and Project actions alike (also used by src/lib/server/project-permissions.ts).
 *
 * - An explicit stored `permissions` map always wins verbatim (missing keys
 *   default to false) — this is how historical CUSTOM records resolve using
 *   their own stored permissions, and it never gets "topped up" by a named
 *   preset's broader defaults.
 * - Only when no explicit map is stored does a named access level / preset
 *   (VIEWER≡VIEW_ONLY / UPDATE_PROGRESS / EDITOR) resolve from the shared
 *   preset table in src/lib/permissions.ts.
 * - CLIENT members and the Project creator are never granted Colleague
 *   permissions this way — creator gets full OWNER_PERMISSIONS, the Client
 *   boundary is enforced separately (memberType + clientVisible).
 */
export function resolveEffectivePermissions(input: {
  isOwner: boolean;
  memberType: string | null;
  /** Canonical accessLevel (preferred). */
  accessLevel?: string | null;
  /** Legacy permissionPreset — still read for historical members. */
  permissionPreset: string | null;
  permissions?: Record<string, unknown> | null;
}): ColleaguePermissions | null {
  if (input.isOwner || input.permissionPreset === "OWNER") {
    return { ...OWNER_PERMISSIONS };
  }
  if (input.memberType === "CLIENT" || input.permissionPreset === "CLIENT") {
    return null;
  }

  const level: ProjectAccessLevel | null =
    resolveAccessLevel(input.accessLevel) ||
    resolveAccessLevel(input.permissionPreset);
  const legacyPreset =
    (level ? accessLevelToLegacyPreset(level) : null) ||
    input.permissionPreset;

  if (!legacyPreset) return null;
  if (input.permissions) {
    return mergePermissions(
      EMPTY_COLLEAGUE_PERMISSIONS,
      input.permissions as Partial<ColleaguePermissions>,
    );
  }
  if (
    legacyPreset === "CUSTOM" ||
    legacyPreset === "VIEW_ONLY" ||
    legacyPreset === "UPDATE_PROGRESS" ||
    legacyPreset === "EDITOR"
  ) {
    return permissionsForPreset(legacyPreset as ColleaguePreset);
  }
  return null;
}

export type DirectoryProject = Project & {
  /** True when the current uid is project.createdBy. */
  isOwner: boolean;
  /** Active shared members (excluding the creator) — only set for owned projects. */
  sharedActiveCount?: number;
  memberType?: string | null;
  accessLevel?: string | null;
  permissionPreset?: string | null;
  effectivePermissions?: ColleaguePermissions | null;
};

function mapProjectDoc(
  workspaceId: string,
  id: string,
  data: Record<string, unknown>,
): Project {
  return {
    id,
    companyId: String(data.companyId || workspaceId),
    workspaceId: String(data.workspaceId || workspaceId),
    createdBy: (data.createdBy as string) ?? null,
    updatedBy: (data.updatedBy as string) ?? null,
    name: (data.name as string) ?? null,
    code: (data.code as string) ?? null,
    clientName: (data.clientName as string) ?? null,
    address: (data.address as string) ?? null,
    coverPhotoUrl: (data.coverPhotoUrl as string) ?? null,
    tour3dUrl: (data.tour3dUrl as string) ?? null,
    tour3dLabel: (data.tour3dLabel as string) ?? null,
    images3d: Array.isArray(data.images3d) ? (data.images3d as Project["images3d"]) : [],
    overview3dImageId: data.overview3dImageId as string | undefined,
    startDate: (data.startDate as string) ?? null,
    contractCompletionDate: (data.contractCompletionDate as string) ?? null,
    forecastCompletionDate: (data.forecastCompletionDate as string) ?? null,
    actualCompletionDate: (data.actualCompletionDate as string) ?? null,
    manager: (data.manager as string) ?? null,
    managerId: (data.managerId as string) ?? null,
    managerName: (data.managerName as string) ?? null,
    status: (data.status as ProjectStatus) || "upcoming",
    forecastStatus: data.forecastStatus as Project["forecastStatus"],
    clientUserIds: Array.isArray(data.clientUserIds)
      ? (data.clientUserIds as string[])
      : [],
    staffIds: Array.isArray(data.staffIds) ? (data.staffIds as string[]) : [],
    internalNotes: (data.internalNotes as string) ?? null,
    dailyReminderHour: data.dailyReminderHour as number | undefined,
    staleDaysThreshold:
      typeof data.staleDaysThreshold === "number" ? data.staleDaysThreshold : 3,
    allowStaffPublish: Boolean(data.allowStaffPublish),
    allowClientDownload: Boolean(data.allowClientDownload),
    purchaseSettings: data.purchaseSettings as Project["purchaseSettings"],
    photoCount: Number(data.photoCount || 0),
    videoCount: Number(data.videoCount || 0),
    storageBytes: Number(data.storageBytes || 0),
    lastUpdateAt: data.lastUpdateAt as string | undefined,
    lastClientUpdateAt: data.lastClientUpdateAt as string | undefined,
    deletedAt: (data.deletedAt as string) ?? null,
    purgeAt: (data.purgeAt as string) ?? null,
    deletedBy: (data.deletedBy as string) ?? null,
    statusBeforeTrash: (data.statusBeforeTrash as ProjectStatus) ?? null,
    createdAt: String(data.createdAt || ""),
    updatedAt: String(data.updatedAt || data.createdAt || ""),
  };
}

const LISTABLE_STATUSES: ProjectStatus[] = [
  "upcoming",
  "in_progress",
  "on_hold",
  "completed",
  "archived",
];

/**
 * True for a genuine /companies/{workspaceId}/projects/{projectId}/members/{uid}
 * document — collectionGroup("members") also matches workspaces/{id}/members
 * (a different collection). Requires the doc id itself to equal uid (the
 * server always writes member docs at that exact path in project-access.ts),
 * not just a same-named `uid` field, so a membership can never be trusted
 * from stray field values alone.
 */
function isProjectMemberDoc(
  docId: string,
  uid: string,
  data: Record<string, unknown>,
) {
  return (
    docId === uid &&
    data.uid === uid &&
    Boolean(data.projectId) &&
    Boolean(data.workspaceId)
  );
}

/**
 * Authoritative project discovery for a USER: everything they created, plus
 * everything they hold an ACTIVE project membership for. Never consults
 * users/{uid}.role, company admin, or workspace owner status.
 */
export async function listProjectsForUser(
  uid: string,
): Promise<DirectoryProject[]> {
  const db = getAdminDb();

  const [ownedSnap, memberSnap] = await Promise.all([
    db.collectionGroup("projects").where("createdBy", "==", uid).get(),
    db
      .collectionGroup("members")
      .where("uid", "==", uid)
      .where("status", "==", "ACTIVE")
      .get(),
  ]);

  const byKey = new Map<string, DirectoryProject>();

  for (const doc of ownedSnap.docs) {
    const data = doc.data() || {};
    const workspaceId = String(data.workspaceId || data.companyId || "");
    if (!workspaceId) continue;
    if (!LISTABLE_STATUSES.includes((data.status as ProjectStatus) || "upcoming")) {
      continue;
    }
    const project = mapProjectDoc(workspaceId, doc.id, data);
    byKey.set(`${workspaceId}:${doc.id}`, {
      ...project,
      isOwner: true,
      memberType: "OWNER",
      permissionPreset: "OWNER",
      effectivePermissions: { ...OWNER_PERMISSIONS },
    });
  }

  const sharedCandidates = memberSnap.docs
    .filter((d) => isProjectMemberDoc(d.id, uid, d.data() || {}))
    .map((d) => d.data() || {})
    .map((data) => ({
      workspaceId: String(data.workspaceId),
      projectId: String(data.projectId),
      ...memberHint(data),
    }))
    .filter(
      (c) =>
        c.workspaceId && c.projectId && !byKey.has(`${c.workspaceId}:${c.projectId}`),
    );

  const sharedProjects = await Promise.all(
    sharedCandidates.map(async (candidate) => {
      const { workspaceId, projectId } = candidate;
      try {
        const snap = await db
          .doc(`companies/${workspaceId}/projects/${projectId}`)
          .get();
        if (!snap.exists) return null;
        const data = snap.data() || {};
        if (!LISTABLE_STATUSES.includes((data.status as ProjectStatus) || "upcoming")) {
          return null;
        }
        const project = mapProjectDoc(workspaceId, projectId, data);
        return {
          key: `${workspaceId}:${projectId}`,
          project:
            candidate.memberType === "CLIENT"
              ? stripInternalFieldsForClient(project)
              : project,
          candidate,
        };
      } catch {
        return null;
      }
    }),
  );

  for (const entry of sharedProjects) {
    if (!entry) continue;
    if (byKey.has(entry.key)) continue;
    byKey.set(entry.key, {
      ...entry.project,
      isOwner: false,
      memberType: entry.candidate.memberType,
      accessLevel: entry.candidate.accessLevel,
      permissionPreset: entry.candidate.permissionPreset,
      effectivePermissions: entry.candidate.effectivePermissions,
    });
  }

  const results = Array.from(byKey.values());

  // Shared-active count (excludes creator) for owned projects only.
  await Promise.all(
    results
      .filter((p) => p.isOwner)
      .map(async (p) => {
        try {
          const ws = p.workspaceId || p.companyId;
          const membersSnap = await db
            .collection(`companies/${ws}/projects/${p.id}/members`)
            .where("status", "==", "ACTIVE")
            .get();
          p.sharedActiveCount = membersSnap.docs.filter(
            (d) => d.id !== p.createdBy,
          ).length;
        } catch {
          p.sharedActiveCount = 0;
        }
      }),
  );

  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type ResolvedProject = {
  workspaceId: string;
  project: Project;
  isOwner: boolean;
  /** UI-hint only — servers always re-check the member doc themselves. */
  memberType: string | null;
  accessLevel: string | null;
  permissionPreset: string | null;
  /** Normalized permission map for the caller — see resolveEffectivePermissions. */
  effectivePermissions: ColleaguePermissions | null;
};

function memberHint(data: Record<string, unknown> | undefined) {
  const memberType = data ? String(data.memberType || "") || null : null;
  const accessLevel = data
    ? String(data.accessLevel || "") || null
    : null;
  const permissionPreset = data
    ? String(data.permissionPreset || "") || null
    : null;
  return {
    memberType,
    accessLevel,
    permissionPreset,
    effectivePermissions: resolveEffectivePermissions({
      isOwner: false,
      memberType,
      accessLevel,
      permissionPreset,
      permissions:
        data && data.permissions && typeof data.permissions === "object"
          ? (data.permissions as Record<string, unknown>)
          : null,
    }),
  };
}

/**
 * Client members never see internal-only Project fields regardless of what
 * the underlying Firestore document contains. This is an application-layer
 * boundary on top of Rules (Firestore cannot restrict individual fields on
 * a document read) — see docs/security-notes for the residual risk of a
 * client reading the raw Firestore document directly.
 */
function stripInternalFieldsForClient(project: Project): Project {
  return { ...project, internalNotes: null };
}

/**
 * Resolve a single project the USER may access: creator OR ACTIVE member.
 * Returns the project's real workspaceId — never assumes the caller's
 * defaultWorkspaceId, which is required for cross-workspace shared Projects.
 */
export async function resolveProjectForUser(
  uid: string,
  projectId: string,
  workspaceIdHint?: string,
): Promise<ResolvedProject | null> {
  const db = getAdminDb();
  const hint = (workspaceIdHint || "").trim();

  if (hint) {
    const snap = await db.doc(`companies/${hint}/projects/${projectId}`).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const isOwner = data.createdBy === uid;
      if (isOwner) {
        return {
          workspaceId: hint,
          project: mapProjectDoc(hint, projectId, data),
          isOwner: true,
          memberType: "OWNER",
          accessLevel: null,
          permissionPreset: "OWNER",
          effectivePermissions: { ...OWNER_PERMISSIONS },
        };
      }
      const member = await db
        .doc(`companies/${hint}/projects/${projectId}/members/${uid}`)
        .get();
      if (member.exists && member.data()?.status === "ACTIVE") {
        const hintInfo = memberHint(member.data());
        const project = mapProjectDoc(hint, projectId, data);
        return {
          workspaceId: hint,
          project:
            hintInfo.memberType === "CLIENT"
              ? stripInternalFieldsForClient(project)
              : project,
          isOwner: false,
          ...hintInfo,
        };
      }
    }
  }

  // Owned — search across every workspace via collectionGroup.
  const ownedSnap = await db
    .collectionGroup("projects")
    .where("createdBy", "==", uid)
    .get();
  const ownedDoc = ownedSnap.docs.find((d) => d.id === projectId);
  if (ownedDoc) {
    const data = ownedDoc.data() || {};
    const workspaceId = String(data.workspaceId || data.companyId || "");
    if (workspaceId) {
      return {
        workspaceId,
        project: mapProjectDoc(workspaceId, projectId, data),
        isOwner: true,
        memberType: "OWNER",
        accessLevel: null,
        permissionPreset: "OWNER",
        effectivePermissions: { ...OWNER_PERMISSIONS },
      };
    }
  }

  // Shared — find an ACTIVE membership for this exact project.
  const memberSnap = await db
    .collectionGroup("members")
    .where("uid", "==", uid)
    .where("projectId", "==", projectId)
    .where("status", "==", "ACTIVE")
    .get();
  const memberDoc = memberSnap.docs.find((d) =>
    isProjectMemberDoc(d.id, uid, d.data() || {}),
  );
  if (memberDoc) {
    const memberData = memberDoc.data() || {};
    const workspaceId = String(memberData.workspaceId || "");
    if (workspaceId) {
      const snap = await db
        .doc(`companies/${workspaceId}/projects/${projectId}`)
        .get();
      if (snap.exists) {
        const hintInfo = memberHint(memberData);
        const project = mapProjectDoc(workspaceId, projectId, snap.data() || {});
        return {
          workspaceId,
          project:
            hintInfo.memberType === "CLIENT"
              ? stripInternalFieldsForClient(project)
              : project,
          isOwner: false,
          ...hintInfo,
        };
      }
    }
  }

  return null;
}
