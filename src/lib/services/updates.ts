import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { COMPANY_ID } from "../constants";
import { AUTH_BYPASS, DEMO_UPDATES } from "../demo";
import { updatesPath } from "../paths";
import { todayKey } from "../utils";
import {
  appendDemoMedia,
  createMediaRecord,
  uploadMediaFile,
} from "./media";
import { updateProject } from "./projects";
import { isVideoFile } from "../utils";
import type {
  DailyUpdate,
  MediaItem,
  MediaVisibility,
  Visibility,
} from "../types";

let demoUpdates: DailyUpdate[] = [...DEMO_UPDATES];

type PublishUpdateInput = {
  projectId: string;
  workItems: string[];
  customActivities: string[];
  noWorkToday: boolean;
  note?: string;
  visibility: Visibility;
  files: File[];
  createdBy: string;
  createdByName: string;
  date?: string;
  onFileProgress?: (fileName: string, pct: number) => void;
};

function toMediaVisibility(visibility: Visibility): MediaVisibility {
  if (visibility === "client_visible") return "client_visible";
  return "internal";
}

export async function listUpdates(
  projectId: string,
  options?: { clientOnly?: boolean },
) {
  if (AUTH_BYPASS) {
    let updates = demoUpdates.filter((u) => u.projectId === projectId);
    if (options?.clientOnly) {
      updates = updates.filter((u) => u.visibility === "client_visible");
    }
    return updates.sort((a, b) => {
      if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
      return b.date.localeCompare(a.date);
    });
  }

  const q = query(
    collection(db, updatesPath(projectId)),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  let updates = snap.docs.map(
    (d) =>
      ({ id: d.id, ...(d.data() as Omit<DailyUpdate, "id">) }) as DailyUpdate,
  );

  if (options?.clientOnly) {
    updates = updates.filter((u) => u.visibility === "client_visible");
  }

  return updates.sort((a, b) => {
    if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt);
    return b.date.localeCompare(a.date);
  });
}

export async function hasUpdateOnDate(projectId: string, date: string) {
  if (AUTH_BYPASS) {
    return demoUpdates.some((u) => u.projectId === projectId && u.date === date);
  }
  const q = query(
    collection(db, updatesPath(projectId)),
    where("date", "==", date),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function publishDailyUpdate(input: PublishUpdateInput) {
  if (AUTH_BYPASS) {
    const date = input.date || todayKey();
    const updateId = `demo-u-${Date.now()}`;
    const mediaVisibility = toMediaVisibility(input.visibility);
    const mediaItems: MediaItem[] = input.files.map((file, index) => {
      const kind = isVideoFile(file) ? "video" : "photo";
      input.onFileProgress?.(file.name, 100);
      return {
        id: `demo-m-${Date.now()}-${index}`,
        projectId: input.projectId,
        companyId: COMPANY_ID,
        updateId,
        type: kind,
        storagePath: `demo/local/${file.name}`,
        downloadUrl: URL.createObjectURL(file),
        fileName: file.name,
        contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
        sizeBytes: file.size,
        workItems: [...input.workItems, ...input.customActivities],
        caption: input.note,
        visibility: mediaVisibility,
        uploadedBy: input.createdBy,
        uploadedByName: input.createdByName,
        date,
        createdAt: new Date().toISOString(),
      };
    });

    const update: DailyUpdate = {
      id: updateId,
      projectId: input.projectId,
      companyId: COMPANY_ID,
      date,
      workItems: input.workItems,
      customActivities: input.customActivities,
      noWorkToday: input.noWorkToday,
      note: input.note,
      visibility: input.visibility,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      photoCount: mediaItems.filter((m) => m.type === "photo").length,
      videoCount: mediaItems.filter((m) => m.type === "video").length,
      mediaIds: mediaItems.map((m) => m.id),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    demoUpdates = [update, ...demoUpdates];
    if (mediaItems.length) appendDemoMedia(mediaItems);

    const project = await import("./projects").then((m) =>
      m.getProject(input.projectId),
    );
    await updateProject(input.projectId, {
      lastUpdateAt: update.createdAt,
      status: "in_progress",
      photoCount: (project?.photoCount || 0) + update.photoCount,
      videoCount: (project?.videoCount || 0) + update.videoCount,
      storageBytes:
        (project?.storageBytes || 0) +
        mediaItems.reduce((sum, m) => sum + m.sizeBytes, 0),
      ...(input.visibility === "client_visible"
        ? { lastClientUpdateAt: update.createdAt }
        : {}),
    });
    return update;
  }

  const date = input.date || todayKey();
  const mediaVisibility = toMediaVisibility(input.visibility);
  const mediaIds: string[] = [];
  let photoCount = 0;
  let videoCount = 0;
  let storageBytes = 0;

  for (const file of input.files) {
    const uploaded = await uploadMediaFile(input.projectId, file, {
      date,
      visibility: mediaVisibility,
      onProgress: (pct) => input.onFileProgress?.(file.name, pct),
    });

    const media = await createMediaRecord(input.projectId, {
      updateId: undefined,
      type: uploaded.type,
      storagePath: uploaded.storagePath,
      downloadUrl: uploaded.downloadUrl,
      fileName: uploaded.fileName,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      workItems: [
        ...input.workItems,
        ...input.customActivities,
      ],
      caption: input.note,
      visibility: mediaVisibility,
      uploadedBy: input.createdBy,
      uploadedByName: input.createdByName,
      date,
    });

    mediaIds.push(media.id);
    storageBytes += uploaded.sizeBytes;
    if (uploaded.type === "photo") photoCount += 1;
    else videoCount += 1;
  }

  const now = new Date().toISOString();
  const updateData: Omit<DailyUpdate, "id"> = {
    projectId: input.projectId,
    companyId: COMPANY_ID,
    date,
    workItems: input.workItems,
    customActivities: input.customActivities,
    noWorkToday: input.noWorkToday,
    note: input.note,
    visibility: input.visibility,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    photoCount,
    videoCount,
    mediaIds,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(
    collection(db, updatesPath(input.projectId)),
    updateData,
  );

  // Link media back to update
  await Promise.all(
    mediaIds.map((id) =>
      updateDoc(doc(db, `companies/${COMPANY_ID}/projects/${input.projectId}/media`, id), {
        updateId: ref.id,
      }),
    ),
  );

  const projectPatch: Parameters<typeof updateProject>[1] = {
    lastUpdateAt: now,
    status: "in_progress",
  };

  if (input.visibility === "client_visible") {
    projectPatch.lastClientUpdateAt = now;
  }

  // Increment counters via read-modify in updateProject caller style
  const { getProject } = await import("./projects");
  const project = await getProject(input.projectId);
  if (project) {
    await updateProject(input.projectId, {
      ...projectPatch,
      photoCount: project.photoCount + photoCount,
      videoCount: project.videoCount + videoCount,
      storageBytes: project.storageBytes + storageBytes,
    });
  }

  return { id: ref.id, ...updateData };
}

export function groupUpdatesByDate(updates: DailyUpdate[]) {
  const map = new Map<string, DailyUpdate[]>();
  updates.forEach((u) => {
    const list = map.get(u.date) || [];
    list.push(u);
    map.set(u.date, list);
  });
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}
