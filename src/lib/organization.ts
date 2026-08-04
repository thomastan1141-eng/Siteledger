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
export type AccountTypeLabel = "Personal" | "Company" | "Client";

export function resolveOrganizationType(
  workspace?: Workspace | null,
): OrganizationType {
  // Until company onboarding writes an explicit type, solo studios are Personal.
  if (workspace?.type === "COMPANY" || workspace?.type === "PERSONAL") {
    return workspace.type;
  }
  return "PERSONAL";
}

export function resolveAccountTypeLabel(
  profile: AppUser | null,
  workspace?: Workspace | null,
  membership?: WorkspaceMember | null,
): AccountTypeLabel {
  if (!profile) return "Personal";
  if (profile.role === "client") return "Client";
  if (profile.role === "staff") return "Company";
  if (resolveOrganizationType(workspace) === "COMPANY") return "Company";
  if (membership?.role === "OWNER" || profile.role === "admin") return "Personal";
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
