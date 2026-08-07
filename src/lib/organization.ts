import type {
  AppUser,
  OrganizationType,
  Workspace,
  WorkspaceMember,
} from "./types";

/**
 * Product term “Organization” maps to the existing workspace tenant
 * (`workspaces/{id}` + `companies/{id}` paths). A full path rename to
 * `organizations/{id}` is deferred so live project data stays intact.
 */

export type OrganizationMemberRole =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "STAFF"
  | "VIEWER";
export type AccountTypeLabel = "Personal" | "Company";

export function resolveOrganizationType(
  workspace?: Workspace | null,
): OrganizationType {
  // Until company onboarding writes an explicit type, solo studios are Personal.
  if (workspace?.type === "COMPANY" || workspace?.type === "PERSONAL") {
    return workspace.type;
  }
  return "PERSONAL";
}

/**
 * Cosmetic label only — never used for authorization. Every USER is equal;
 * this never branches on users/{uid}.role.
 */
export function resolveAccountTypeLabel(
  profile: AppUser | null,
  workspace?: Workspace | null,
  _membership?: WorkspaceMember | null,
): AccountTypeLabel {
  if (!profile) return "Personal";
  if (resolveOrganizationType(workspace) === "COMPANY") return "Company";
  return "Personal";
}

export function organizationDisplayName(
  profile: AppUser | null,
  workspace?: Workspace | null,
): string {
  return (
    profile?.studioName?.trim() ||
    workspace?.name?.trim() ||
    "—"
  );
}
