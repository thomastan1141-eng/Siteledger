import type { ColleaguePermissions, ColleaguePreset } from "./types";

export const EMPTY_COLLEAGUE_PERMISSIONS: ColleaguePermissions = {
  viewProject: false,
  viewSchedule: false,
  updateSchedule: false,
  viewJournal: false,
  addJournal: false,
  editOwnJournal: false,
  editAllJournal: false,
  deleteOwnJournal: false,
  deleteAllJournal: false,
  viewMedia: false,
  downloadMedia: false,
  uploadMedia: false,
  editOwnMedia: false,
  editAllMedia: false,
  deleteOwnMedia: false,
  deleteAllMedia: false,
  publishMediaToClient: false,
  viewPurchases: false,
  editPurchases: false,
  editProjectDetails: false,
  manageProjectAccess: false,
};

export const OWNER_PERMISSIONS: ColleaguePermissions = {
  viewProject: true,
  viewSchedule: true,
  updateSchedule: true,
  viewJournal: true,
  addJournal: true,
  editOwnJournal: true,
  editAllJournal: true,
  deleteOwnJournal: true,
  deleteAllJournal: true,
  viewMedia: true,
  downloadMedia: true,
  uploadMedia: true,
  editOwnMedia: true,
  editAllMedia: true,
  deleteOwnMedia: true,
  deleteAllMedia: true,
  publishMediaToClient: true,
  viewPurchases: true,
  editPurchases: true,
  editProjectDetails: true,
  manageProjectAccess: true,
};

export function permissionsForPreset(
  preset: ColleaguePreset,
): ColleaguePermissions {
  switch (preset) {
    case "VIEW_ONLY":
      return {
        ...EMPTY_COLLEAGUE_PERMISSIONS,
        viewProject: true,
        viewSchedule: true,
        viewJournal: true,
        viewMedia: true,
        downloadMedia: true,
        viewPurchases: true,
      };
    case "UPDATE_PROGRESS":
      return {
        ...EMPTY_COLLEAGUE_PERMISSIONS,
        viewProject: true,
        viewSchedule: true,
        updateSchedule: true,
        viewJournal: true,
        addJournal: true,
        editOwnJournal: true,
        viewMedia: true,
        downloadMedia: true,
        uploadMedia: true,
        editOwnMedia: true,
        deleteOwnMedia: true,
        viewPurchases: true,
      };
    case "EDITOR":
      return {
        ...OWNER_PERMISSIONS,
        manageProjectAccess: false,
      };
    case "CUSTOM":
      return { ...EMPTY_COLLEAGUE_PERMISSIONS, viewProject: true };
    default:
      return { ...EMPTY_COLLEAGUE_PERMISSIONS };
  }
}

export function mergePermissions(
  base: ColleaguePermissions,
  patch?: Partial<ColleaguePermissions> | null,
): ColleaguePermissions {
  return { ...base, ...(patch || {}) };
}

/** Human-readable labels for the custom permission checkbox grid. */
export const COLLEAGUE_PERMISSION_LABELS: Record<
  keyof ColleaguePermissions,
  string
> = {
  viewProject: "View project",
  viewSchedule: "View schedule",
  updateSchedule: "Update schedule",
  viewJournal: "View journal",
  addJournal: "Add journal entries",
  editOwnJournal: "Edit own journal entries",
  editAllJournal: "Edit all journal entries",
  deleteOwnJournal: "Delete own journal entries",
  deleteAllJournal: "Delete all journal entries",
  viewMedia: "View media",
  downloadMedia: "Download media",
  uploadMedia: "Upload media",
  editOwnMedia: "Edit own media",
  editAllMedia: "Edit all media",
  deleteOwnMedia: "Delete own media",
  deleteAllMedia: "Delete all media",
  publishMediaToClient: "Publish media to client",
  viewPurchases: "View purchases",
  editPurchases: "Edit purchases",
  editProjectDetails: "Edit project details",
  manageProjectAccess: "Manage project access",
};

/** Stable display order for the custom permission checkbox grid. */
export const COLLEAGUE_PERMISSION_KEYS = Object.keys(
  EMPTY_COLLEAGUE_PERMISSIONS,
) as (keyof ColleaguePermissions)[];
