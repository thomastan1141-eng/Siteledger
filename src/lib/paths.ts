import { COMPANY_ID } from "./constants";

export const companyRef = (companyId = COMPANY_ID) => `companies/${companyId}`;

export const usersPath = (companyId = COMPANY_ID) =>
  `${companyRef(companyId)}/users`;

export const projectsPath = (companyId = COMPANY_ID) =>
  `${companyRef(companyId)}/projects`;

export const projectPath = (projectId: string, companyId = COMPANY_ID) =>
  `${projectsPath(companyId)}/${projectId}`;

export const categoriesPath = (companyId = COMPANY_ID) =>
  `${companyRef(companyId)}/workCategories`;

export const schedulePath = (projectId: string, companyId = COMPANY_ID) =>
  `${projectPath(projectId, companyId)}/schedule`;

/** Same stages collection — product name is “stages”, storage path kept for migration. */
export const stagesPath = schedulePath;

export const dailyPlansPath = (projectId: string, companyId = COMPANY_ID) =>
  `${projectPath(projectId, companyId)}/dailyPlans`;

export const updatesPath = (projectId: string, companyId = COMPANY_ID) =>
  `${projectPath(projectId, companyId)}/updates`;

export const mediaPath = (projectId: string, companyId = COMPANY_ID) =>
  `${projectPath(projectId, companyId)}/media`;

export const purchasesPath = (projectId: string, companyId = COMPANY_ID) =>
  `${projectPath(projectId, companyId)}/purchases`;

export const remindersPath = (companyId = COMPANY_ID) =>
  `${companyRef(companyId)}/reminders`;

export function storageMediaPath(
  projectId: string,
  date: string,
  kind: "photos" | "videos" | "internal" | "handover" | "documents",
  fileName: string,
  companyId = COMPANY_ID,
) {
  return `companies/${companyId}/projects/${projectId}/updates/${date}/${kind}/${fileName}`;
}

export function storagePurchasePhotoPath(
  projectId: string,
  purchaseId: string,
  fileName: string,
  companyId = COMPANY_ID,
) {
  return `companies/${companyId}/projects/${projectId}/purchases/${purchaseId}/photos/${fileName}`;
}

export function storage3dPath(
  projectId: string,
  fileName: string,
  companyId = COMPANY_ID,
) {
  return `companies/${companyId}/projects/${projectId}/3d/${fileName}`;
}
