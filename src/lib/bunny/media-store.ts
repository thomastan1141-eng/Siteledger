import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { bunnyConfig } from "@/lib/server/bunny-config";
import type { BunnyVideoDetails } from "./server";
import type { BunnyVideoStatus, MediaVisibility } from "@/lib/types";

export function mediaDocPath(workspaceId: string, projectId: string, mediaId: string) {
  return `companies/${workspaceId}/projects/${projectId}/media/${mediaId}`;
}

export function mediaCollectionPath(workspaceId: string, projectId: string) {
  return `companies/${workspaceId}/projects/${projectId}/media`;
}

export async function findMediaByClientUploadId(
  workspaceId: string,
  projectId: string,
  clientUploadId: string,
): Promise<{ id: string; bunnyVideoId?: string; [key: string]: unknown } | null> {
  const db = getAdminDb();
  const snap = await db
    .collection(mediaCollectionPath(workspaceId, projectId))
    .where("clientUploadId", "==", clientUploadId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  const data = doc.data() as Record<string, unknown>;
  return {
    ...data,
    id: doc.id,
    bunnyVideoId: data.bunnyVideoId ? String(data.bunnyVideoId) : undefined,
  };
}

export async function findMediaByBunnyVideoId(bunnyVideoId: string) {
  const db = getAdminDb();
  const snap = await db
    .collectionGroup("media")
    .where("bunnyVideoId", "==", bunnyVideoId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  const parts = doc.ref.path.split("/");
  // companies/{ws}/projects/{projectId}/media/{mediaId}
  return {
    id: doc.id,
    workspaceId: parts[1] || "",
    projectId: parts[3] || "",
    path: doc.ref.path,
    data: doc.data() as Record<string, unknown>,
  };
}

export async function createBunnyMediaRecord(input: {
  workspaceId: string;
  projectId: string;
  bunnyVideoId: string;
  title: string | null;
  description: string | null;
  clientVisible: boolean;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName: string;
  clientUploadId: string;
  capturedAt?: string | null;
  date: string;
}) {
  const db = getAdminDb();
  const now = new Date().toISOString();
  const visibility: MediaVisibility = input.clientVisible
    ? "client_visible"
    : "internal";
  const ref = db.collection(mediaCollectionPath(input.workspaceId, input.projectId)).doc();
  const data = {
    projectId: input.projectId,
    companyId: input.workspaceId,
    workspaceId: input.workspaceId,
    type: "video",
    provider: "BUNNY_STREAM",
    title: input.title,
    description: input.description,
    caption: input.title || input.description || "",
    clientVisible: input.clientVisible,
    visibility,
    bunnyLibraryId: Number(bunnyConfig.libraryId) || bunnyConfig.libraryId,
    bunnyVideoId: input.bunnyVideoId,
    status: "INITIALIZING" as BunnyVideoStatus,
    mediaLifecycle: "active" as const,
    encodeProgress: null,
    originalFileName: input.fileName,
    fileName: input.fileName,
    mimeType: input.fileType,
    contentType: input.fileType,
    sourceSizeBytes: input.fileSize,
    sizeBytes: input.fileSize,
    storagePath: "",
    downloadUrl: "",
    thumbnailUrl: null,
    thumbnailBlurhash: null,
    durationSeconds: null,
    width: null,
    height: null,
    storageSizeBytes: null,
    availableResolutions: null,
    workItems: [] as string[],
    uploadedBy: input.uploadedBy,
    uploadedByName: input.uploadedByName,
    clientUploadId: input.clientUploadId,
    capturedAt: input.capturedAt || null,
    date: input.date,
    createdAt: now,
    updatedAt: now,
    readyAt: null,
    deletedAt: null,
    errorCode: null,
    errorMessage: null,
  };
  await ref.set(data);
  return { id: ref.id, ...data };
}

export async function updateMediaAdmin(
  workspaceId: string,
  projectId: string,
  mediaId: string,
  patch: Record<string, unknown>,
) {
  const db = getAdminDb();
  await db.doc(mediaDocPath(workspaceId, projectId, mediaId)).update({
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export function bunnyDetailsToPatch(
  details: BunnyVideoDetails,
  status: BunnyVideoStatus,
) {
  const patch: Record<string, unknown> = {
    status,
    encodeProgress: details.encodeProgress,
    durationSeconds: details.length,
    width: details.width,
    height: details.height,
    storageSizeBytes: details.storageSize,
    thumbnailUrl: details.thumbnailUrl,
    thumbnailBlurhash: details.thumbnailBlurhash,
    availableResolutions: details.availableResolutions,
    errorCode: status === "FAILED" ? "BUNNY_PROCESSING_FAILED" : null,
    errorMessage:
      status === "FAILED" ? "The video could not be processed." : null,
  };
  if (status === "READY") {
    patch.readyAt = new Date().toISOString();
  }
  return patch;
}

export async function softDeleteMedia(
  workspaceId: string,
  projectId: string,
  mediaId: string,
) {
  await updateMediaAdmin(workspaceId, projectId, mediaId, {
    status: "DELETED",
    mediaLifecycle: "tombstoned",
    deletedAt: new Date().toISOString(),
    downloadUrl: "",
    clientVisible: false,
    visibility: "internal",
  });
}

export { FieldValue };
