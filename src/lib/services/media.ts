import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from "../firebase";
import { AUTH_BYPASS, DEMO_MEDIA } from "../demo";
import { createImageThumbnail } from "../image-compress";
import {
  mediaPath,
  requireTenantId,
  storageMediaPath,
  thumbnailStoragePath,
} from "../paths";
import { sanitizeForFirestore } from "../sanitize";
import { isImageFile, isVideoFile, todayKey } from "../utils";
import type { MediaItem, MediaType, MediaVisibility } from "../types";

let demoMedia: MediaItem[] = [...DEMO_MEDIA];

export function appendDemoMedia(items: MediaItem[]) {
  demoMedia = [...items, ...demoMedia];
}

function uniqueFileName(file: File) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

export async function uploadMediaFile(
  projectId: string,
  file: File,
  options: {
    date?: string;
    visibility: MediaVisibility;
    workspaceId?: string;
    uploadedBy: string;
    /** Pre-allocated Firestore media doc id — required on new uploads. */
    mediaId: string;
    onProgress?: (pct: number) => void;
  },
) {
  if (isVideoFile(file)) {
    throw new Error(
      "Videos must be uploaded through Bunny Stream. Use the video uploader.",
    );
  }

  const date = options.date || todayKey();
  const kind =
    options.visibility === "handover"
      ? "handover"
      : options.visibility === "internal"
        ? "internal"
        : "photos";
  const tenant = requireTenantId(options.workspaceId);

  const path = storageMediaPath(
    projectId,
    date,
    kind,
    uniqueFileName(file),
    tenant,
  );
  const storageRef = ref(getFirebaseStorage(), path);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || undefined,
    customMetadata: {
      mediaId: options.mediaId,
      clientVisible:
        options.visibility === "client_visible" ||
        options.visibility === "handover"
          ? "true"
          : "false",
      uploadedBy: options.uploadedBy,
      projectId,
      workspaceId: tenant,
    },
  });

  await new Promise<UploadTaskSnapshot>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (options.onProgress) {
          options.onProgress(
            Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          );
        }
      },
      reject,
      () => resolve(task.snapshot),
    );
  });

  // Best-effort grid thumbnail — never fail the original upload.
  // Metadata must satisfy mediaUploadMetadataValid (same keys as original).
  let thumbnailPath: string | undefined;
  try {
    const thumb = await createImageThumbnail(file);
    if (thumb) {
      const thumbPath = thumbnailStoragePath(path);
      const clientVisible =
        options.visibility === "client_visible" ||
        options.visibility === "handover"
          ? "true"
          : "false";
      await uploadBytes(ref(getFirebaseStorage(), thumbPath), thumb, {
        contentType: "image/jpeg",
        customMetadata: {
          mediaId: options.mediaId,
          clientVisible,
          uploadedBy: options.uploadedBy,
          projectId,
          workspaceId: tenant,
        },
      });
      thumbnailPath = thumbPath;
    }
  } catch {
    thumbnailPath = undefined;
  }

  return {
    storagePath: path,
    ...(thumbnailPath ? { thumbnailPath } : {}),
    // Photos are displayed via Storage Web SDK getBlob(storagePath) under
    // Storage Rules — never persist a permanent Firebase download-token URL.
    downloadUrl: "",
    sizeBytes: file.size,
    contentType: file.type || "application/octet-stream",
    fileName: file.name,
    type: (isVideoFile(file) ? "video" : "photo") as MediaType,
  };
}

/**
 * Uploads a photo to Firebase Storage and creates its media record in one call,
 * carrying the user-selected capturedAt (date + time) and clientVisible flag.
 */
export async function uploadPhotoMedia(
  projectId: string,
  file: File,
  options: {
    capturedAt: string;
    clientVisible: boolean;
    workspaceId?: string;
    uploadedBy: string;
    uploadedByName: string;
    date?: string;
    onProgress?: (pct: number) => void;
  },
) {
  const workspaceId = requireTenantId(options.workspaceId);
  const date = options.date || options.capturedAt.slice(0, 10) || todayKey();
  const visibility: MediaVisibility = options.clientVisible
    ? "client_visible"
    : "internal";

  const mediaRef = doc(
    collection(getFirebaseDb(), mediaPath(projectId, workspaceId)),
  );

  const uploaded = await uploadMediaFile(projectId, file, {
    date,
    visibility,
    workspaceId,
    uploadedBy: options.uploadedBy,
    mediaId: mediaRef.id,
    onProgress: options.onProgress,
  });

  return createMediaRecord(
    projectId,
    {
      ...uploaded,
      workspaceId,
      visibility,
      clientVisible: options.clientVisible,
      capturedAt: options.capturedAt,
      date,
      workItems: [],
      uploadedBy: options.uploadedBy,
      uploadedByName: options.uploadedByName,
    },
    mediaRef.id,
  );
}

export async function createMediaRecord(
  projectId: string,
  input: Omit<MediaItem, "id" | "projectId" | "companyId" | "createdAt"> & {
    workspaceId?: string;
  },
  mediaId?: string,
) {
  const workspaceId = requireTenantId(input.workspaceId);
  const data: Omit<MediaItem, "id"> = {
    ...input,
    projectId,
    companyId: workspaceId,
    workspaceId,
    provider: input.provider || "FIREBASE_STORAGE",
    mediaLifecycle: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (mediaId) {
    await setDoc(
      doc(getFirebaseDb(), mediaPath(projectId, workspaceId), mediaId),
      sanitizeForFirestore(data),
    );
    return { id: mediaId, ...data };
  }

  const refDoc = await addDoc(
    collection(getFirebaseDb(), mediaPath(projectId, workspaceId)),
    sanitizeForFirestore(data),
  );
  return { id: refDoc.id, ...data };
}

function isActiveMedia(item: MediaItem) {
  if (!item.status) return true;
  return item.status !== "DELETED" && item.status !== "CANCELLED";
}

export async function listMedia(
  projectId: string,
  options?: {
    clientOnly?: boolean;
    type?: MediaType;
    workItem?: string;
    date?: string;
    workspaceId?: string;
  },
) {
  const workspaceId = requireTenantId(options?.workspaceId);
  let items: MediaItem[];

  if (AUTH_BYPASS) {
    items = demoMedia.filter((m) => m.projectId === projectId);
  } else if (options?.clientOnly) {
    // Query excludes tombstones and non-visible docs directly, so Rules never
    // need to grant read access to anything the client can't already see.
    const snap = await getDocs(
      query(
        collection(getFirebaseDb(), mediaPath(projectId, workspaceId)),
        where("clientVisible", "==", true),
        where("mediaLifecycle", "==", "active"),
        orderBy("createdAt", "desc"),
      ),
    );
    items = snap.docs.map(
      (d) =>
        ({ id: d.id, ...(d.data() as Omit<MediaItem, "id">) }) as MediaItem,
    );
  } else {
    // Staff/tenant: query excludes tombstones so Rules can deny reading them outright.
    const snap = await getDocs(
      query(
        collection(getFirebaseDb(), mediaPath(projectId, workspaceId)),
        where("mediaLifecycle", "==", "active"),
        orderBy("createdAt", "desc"),
      ),
    );
    items = snap.docs.map(
      (d) =>
        ({ id: d.id, ...(d.data() as Omit<MediaItem, "id">) }) as MediaItem,
    );
  }

  items = items.filter(isActiveMedia);

  if (options?.clientOnly) {
    items = items.filter(
      (m) =>
        m.clientVisible === true ||
        m.visibility === "client_visible" ||
        m.visibility === "handover",
    );
  }
  if (options?.type) {
    items = items.filter((m) => m.type === options.type);
  }
  if (options?.date) {
    items = items.filter((m) => m.date === options.date);
  }
  if (options?.workItem) {
    items = items.filter((m) => m.workItems.includes(options.workItem!));
  }

  return items;
}

export async function updateMediaCaption(
  projectId: string,
  mediaId: string,
  caption: string,
  workspaceId?: string,
) {
  const ws = requireTenantId(workspaceId);
  await updateDoc(doc(getFirebaseDb(), mediaPath(projectId, ws), mediaId), {
    caption,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Toggle client visibility for a single media item (photo or Bunny video)
 * through the server route so permissions and audit logging apply.
 */
export async function setMediaClientVisible(input: {
  mediaId: string;
  projectId: string;
  workspaceId?: string;
  clientVisible: boolean;
}) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  const token = await user.getIdToken();
  const res = await fetch(
    `/api/media/${encodeURIComponent(input.mediaId)}/visibility`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        clientVisible: input.clientVisible,
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error || "Could not update visibility. Please try again.",
    );
  }
  return data as { clientVisible: boolean; visibility: MediaVisibility };
}

/**
 * Delete one media item (photo or Bunny video). Media library and
 * Journal/Journey both call this — server enforces DELETE_MEDIA.
 */
export async function deleteProjectMedia(input: {
  mediaId: string;
  projectId: string;
  workspaceId?: string;
}) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Please sign in again.");
  const token = await user.getIdToken();
  const res = await fetch(
    `/api/media/${encodeURIComponent(input.mediaId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error || "The media could not be deleted. Please try again.",
    );
  }
  return data as { ok: true; kind?: "photo" | "video" };
}

export function detectMediaKind(file: File): MediaType | null {
  if (isImageFile(file)) return "photo";
  if (isVideoFile(file)) return "video";
  return null;
}
