import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { db, storage } from "../firebase";
import { COMPANY_ID } from "../constants";
import { AUTH_BYPASS, DEMO_MEDIA } from "../demo";
import { mediaPath, storageMediaPath } from "../paths";
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
    onProgress?: (pct: number) => void;
  },
) {
  const date = options.date || todayKey();
  const kind = isVideoFile(file)
    ? "videos"
    : options.visibility === "handover"
      ? "handover"
      : options.visibility === "internal"
        ? "internal"
        : "photos";

  const path = storageMediaPath(
    projectId,
    date,
    kind,
    uniqueFileName(file),
  );
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || undefined,
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

  const downloadUrl = await getDownloadURL(task.snapshot.ref);
  return {
    storagePath: path,
    downloadUrl,
    sizeBytes: file.size,
    contentType: file.type || "application/octet-stream",
    fileName: file.name,
    type: (isVideoFile(file) ? "video" : "photo") as MediaType,
  };
}

export async function createMediaRecord(
  projectId: string,
  input: Omit<MediaItem, "id" | "projectId" | "companyId" | "createdAt">,
) {
  const data: Omit<MediaItem, "id"> = {
    ...input,
    projectId,
    companyId: COMPANY_ID,
    createdAt: new Date().toISOString(),
  };
  const refDoc = await addDoc(collection(db, mediaPath(projectId)), data);
  return { id: refDoc.id, ...data };
}

export async function listMedia(
  projectId: string,
  options?: {
    clientOnly?: boolean;
    type?: MediaType;
    workItem?: string;
    date?: string;
  },
) {
  let items = AUTH_BYPASS
    ? demoMedia.filter((m) => m.projectId === projectId)
    : (
        await getDocs(
          query(
            collection(db, mediaPath(projectId)),
            orderBy("createdAt", "desc"),
          ),
        )
      ).docs.map(
        (d) =>
          ({ id: d.id, ...(d.data() as Omit<MediaItem, "id">) }) as MediaItem,
      );

  if (options?.clientOnly) {
    items = items.filter(
      (m) => m.visibility === "client_visible" || m.visibility === "handover",
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

export async function updateMediaVisibility(
  projectId: string,
  mediaIds: string[],
  visibility: MediaVisibility,
) {
  const batch = writeBatch(db);
  mediaIds.forEach((id) => {
    batch.update(doc(db, mediaPath(projectId), id), { visibility });
  });
  await batch.commit();
}

export async function updateMediaCaption(
  projectId: string,
  mediaId: string,
  caption: string,
) {
  await updateDoc(doc(db, mediaPath(projectId), mediaId), { caption });
}

export function detectMediaKind(file: File): MediaType | null {
  if (isImageFile(file)) return "photo";
  if (isVideoFile(file)) return "video";
  return null;
}
