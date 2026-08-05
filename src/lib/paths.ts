import { COMPANY_ID } from "./constants";
import type { ProjectStatus } from "./types";

/**
 * Canonical Firebase path helpers.
 *
 * Tenant key: workspaceId (document fields may also mirror companyId = workspaceId).
 * Physical tenant root for project data: companies/{workspaceId}/...
 * SaaS account/workspace: users/{uid}, workspaces/{workspaceId}/...
 *
 * Never invent organizationId as a path segment.
 */

/** Legacy single-tenant id — only for explicit legacy fallbacks, never silent writes. */
export const LEGACY_TENANT_ID = COMPANY_ID;

/** Project statuses that Client list queries may return (excludes trashed/purging). */
export const LISTABLE_PROJECT_STATUSES: ProjectStatus[] = [
  "upcoming",
  "in_progress",
  "on_hold",
  "completed",
  "archived",
];

/**
 * Require an explicit workspace/tenant id for writes and scoped reads.
 * Throws if missing — do not fall back to siteledger on write paths.
 */
export function requireTenantId(workspaceId?: string | null): string {
  const ws = workspaceId?.trim();
  if (!ws) {
    throw new Error(
      "Workspace is not ready yet. Refresh the page and try again.",
    );
  }
  return ws;
}

/**
 * @deprecated Prefer requireTenantId for writes. Legacy read fallback only.
 * Returns workspaceId or LEGACY_TENANT_ID when omitted.
 */
export function tenantId(workspaceId?: string | null) {
  return workspaceId?.trim() || LEGACY_TENANT_ID;
}

export const companyRef = (companyId: string) => `companies/${companyId}`;

/** Top-level SaaS account profiles */
export const accountUsersPath = () => `users`;
export const accountUserPath = (uid: string) => `users/${uid}`;

/** Top-level workspaces */
export const workspacesPath = () => `workspaces`;
export const workspacePath = (workspaceId: string) =>
  `workspaces/${workspaceId}`;
export const workspaceMembersPath = (workspaceId: string) =>
  `workspaces/${workspaceId}/members`;
export const workspaceMemberPath = (workspaceId: string, uid: string) =>
  `workspaces/${workspaceId}/members/${uid}`;

export const usersPath = (companyId: string) =>
  `${companyRef(companyId)}/users`;

export const setupMetaPath = (companyId: string) =>
  `${companyRef(companyId)}/meta/setup`;

export const projectsPath = (companyId: string) =>
  `${companyRef(companyId)}/projects`;

export const projectPath = (projectId: string, companyId: string) =>
  `${projectsPath(companyId)}/${projectId}`;

export const projectMembersPath = (projectId: string, companyId: string) =>
  `${projectPath(projectId, companyId)}/members`;

export const projectMemberPath = (
  projectId: string,
  uid: string,
  companyId: string,
) => `${projectMembersPath(projectId, companyId)}/${uid}`;

export const categoriesPath = (companyId: string) =>
  `${companyRef(companyId)}/workCategories`;

export const schedulePath = (projectId: string, companyId: string) =>
  `${projectPath(projectId, companyId)}/schedule`;

/** Same stages collection — product name is “stages”, storage path kept for migration. */
export const stagesPath = schedulePath;

export const dailyPlansPath = (projectId: string, companyId: string) =>
  `${projectPath(projectId, companyId)}/dailyPlans`;

export const updatesPath = (projectId: string, companyId: string) =>
  `${projectPath(projectId, companyId)}/updates`;

export const mediaPath = (projectId: string, companyId: string) =>
  `${projectPath(projectId, companyId)}/media`;

export const purchasesPath = (projectId: string, companyId: string) =>
  `${projectPath(projectId, companyId)}/purchases`;

export const remindersPath = (companyId: string) =>
  `${companyRef(companyId)}/reminders`;

export const createRequestsPath = (companyId: string) =>
  `${companyRef(companyId)}/createRequests`;

export const auditEventsPath = (companyId: string) =>
  `${companyRef(companyId)}/auditEvents`;

export function storageMediaPath(
  projectId: string,
  date: string,
  kind: "photos" | "videos" | "internal" | "handover" | "documents",
  fileName: string,
  companyId: string,
) {
  return `companies/${companyId}/projects/${projectId}/updates/${date}/${kind}/${fileName}`;
}

export function storagePurchasePhotoPath(
  projectId: string,
  purchaseId: string,
  fileName: string,
  companyId: string,
) {
  return `companies/${companyId}/projects/${projectId}/purchases/${purchaseId}/photos/${fileName}`;
}

export function storage3dPath(
  projectId: string,
  fileName: string,
  companyId: string,
) {
  return `companies/${companyId}/projects/${projectId}/3d/${fileName}`;
}

/**
 * Cover uploads — same tenant root as other project media (`companies/...`).
 * Legacy objects may still exist under `workspaces/.../cover/` (URLs remain valid).
 */
export function storageCoverPath(
  workspaceId: string,
  projectId: string,
  fileName: string,
) {
  return `companies/${workspaceId}/projects/${projectId}/cover/${fileName}`;
}

/** @deprecated Legacy cover root; retained for documentation / dual-read only. */
export function legacyStorageCoverPath(
  workspaceId: string,
  projectId: string,
  fileName: string,
) {
  return `workspaces/${workspaceId}/projects/${projectId}/cover/${fileName}`;
}
