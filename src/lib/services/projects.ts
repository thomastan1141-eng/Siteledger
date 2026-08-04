import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from "firebase/storage";
import { getFirebaseDb, getFirebaseStorage } from "../firebase";
import { COMPANY_ID } from "../constants";
import { AUTH_BYPASS, DEMO_PROJECTS } from "../demo";
import { projectsPath, storage3dPath } from "../paths";
import { deriveForecastStatus, isImageFile } from "../utils";
import type {
  ForecastStatus,
  Project,
  Project3DImage,
  ProjectStatus,
} from "../types";

let demoProjects: Project[] = DEMO_PROJECTS.map((p) => ({
  ...p,
  images3d: p.images3d ? [...p.images3d] : [],
}));

type ProjectInput = {
  clientName: string;
  address: string;
  coverPhotoUrl?: string;
  tour3dUrl?: string;
  tour3dLabel?: string;
  images3d?: Project3DImage[];
  overview3dImageId?: string;
  startDate?: string;
  contractCompletionDate?: string;
  forecastCompletionDate?: string;
  manager?: string;
  /** @deprecated */
  managerId?: string;
  /** @deprecated */
  managerName?: string;
  status?: ProjectStatus;
  internalNotes?: string;
  staffIds?: string[];
  clientUserIds?: string[];
  allowStaffPublish?: boolean;
  allowClientDownload?: boolean;
  purchaseSettings?: {
    rmbToSgdRate: number;
  };
  dailyReminderHour?: number;
  staleDaysThreshold?: number;
};

function mapProject(id: string, data: Record<string, unknown>): Project {
  const address = String(data.address || "").trim();
  const manager = String(data.manager || data.managerName || "").trim();
  const project = {
    id,
    ...(data as Omit<Project, "id">),
    address,
    clientName: String(data.clientName || "").trim(),
    manager: manager || undefined,
    managerName: manager || undefined,
    name: data.name ? String(data.name) : undefined,
    code: data.code ? String(data.code) : undefined,
  };
  return {
    ...project,
    forecastStatus: project.forecastStatus || deriveForecastStatus(project),
  };
}

export async function listProjects(options?: {
  status?: ProjectStatus;
  staffId?: string;
}) {
  if (AUTH_BYPASS) {
    let projects = [...demoProjects].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    if (options?.status) {
      projects = projects.filter((p) => p.status === options.status);
    }
    if (options?.staffId) {
      projects = projects.filter(
        (p) =>
          p.staffIds?.includes(options.staffId!) ||
          p.managerId === options.staffId,
      );
    }
    return projects;
  }

  const col = collection(getFirebaseDb(), projectsPath());
  const q = query(col, orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  let projects = snap.docs.map((d) => mapProject(d.id, d.data()));

  if (options?.status) {
    projects = projects.filter((p) => p.status === options.status);
  }

  if (options?.staffId) {
    projects = projects.filter(
      (p) =>
        p.staffIds?.includes(options.staffId!) ||
        p.managerId === options.staffId,
    );
  }

  return projects;
}

export async function listClientProjects(clientUid: string) {
  if (AUTH_BYPASS) {
    return demoProjects
      .filter((p) => p.clientUserIds?.includes(clientUid))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const col = collection(getFirebaseDb(), projectsPath());
  const q = query(col, where("clientUserIds", "array-contains", clientUid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => mapProject(d.id, d.data()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(projectId: string) {
  if (AUTH_BYPASS) {
    return demoProjects.find((p) => p.id === projectId) || null;
  }
  const snap = await getDoc(doc(getFirebaseDb(), projectsPath(), projectId));
  if (!snap.exists()) return null;
  return mapProject(snap.id, snap.data());
}

export async function createProject(input: ProjectInput) {
  const address = input.address.trim();
  if (!address) throw new Error("Address is required.");
  const clientName = input.clientName.trim();
  if (!clientName) throw new Error("Client name is required.");
  const manager = (input.manager || input.managerName || "").trim();

  if (AUTH_BYPASS) {
    const now = new Date().toISOString();
    const created: Project = {
      id: `demo-${Date.now()}`,
      companyId: COMPANY_ID,
      clientName,
      address,
      coverPhotoUrl: input.coverPhotoUrl,
      startDate: input.startDate,
      contractCompletionDate: input.contractCompletionDate,
      forecastCompletionDate:
        input.forecastCompletionDate || input.contractCompletionDate,
      manager: manager || undefined,
      managerName: manager || undefined,
      status: input.status || "upcoming",
      forecastStatus: "on_track",
      clientUserIds: input.clientUserIds || [],
      staffIds: input.staffIds || [],
      internalNotes: input.internalNotes?.trim() || undefined,
      dailyReminderHour: input.dailyReminderHour ?? 17,
      staleDaysThreshold: input.staleDaysThreshold ?? 3,
      allowStaffPublish: input.allowStaffPublish ?? false,
      allowClientDownload: input.allowClientDownload ?? false,
      tour3dUrl: input.tour3dUrl,
      tour3dLabel: input.tour3dLabel,
      images3d: input.images3d || [],
      photoCount: 0,
      videoCount: 0,
      storageBytes: 0,
      createdAt: now,
      updatedAt: now,
    };
    created.forecastStatus = deriveForecastStatus(created);
    demoProjects = [created, ...demoProjects];
    return created;
  }

  const now = new Date().toISOString();
  const draft: Omit<Project, "id"> = {
    companyId: COMPANY_ID,
    clientName,
    address,
    coverPhotoUrl: input.coverPhotoUrl || "",
    tour3dUrl: input.tour3dUrl || "",
    tour3dLabel: input.tour3dLabel || "",
    images3d: input.images3d || [],
    startDate: input.startDate || "",
    contractCompletionDate: input.contractCompletionDate || "",
    forecastCompletionDate:
      input.forecastCompletionDate || input.contractCompletionDate || "",
    manager,
    managerName: manager,
    status: input.status || "upcoming",
    forecastStatus: "on_track",
    clientUserIds: input.clientUserIds || [],
    staffIds: input.staffIds || [],
    internalNotes: input.internalNotes?.trim() || "",
    dailyReminderHour: input.dailyReminderHour ?? 17,
    staleDaysThreshold: input.staleDaysThreshold ?? 3,
    allowStaffPublish: input.allowStaffPublish ?? false,
    allowClientDownload: input.allowClientDownload ?? false,
    photoCount: 0,
    videoCount: 0,
    storageBytes: 0,
    createdAt: now,
    updatedAt: now,
  };

  draft.forecastStatus = deriveForecastStatus(draft as Project);
  const ref = await addDoc(collection(getFirebaseDb(), projectsPath()), draft);
  return { id: ref.id, ...draft };
}

export async function updateProject(
  projectId: string,
  patch: Partial<ProjectInput> & {
    forecastStatus?: ForecastStatus;
    actualCompletionDate?: string;
    lastUpdateAt?: string;
    lastClientUpdateAt?: string;
    photoCount?: number;
    videoCount?: number;
    storageBytes?: number;
  },
) {
  const current = await getProject(projectId);
  if (!current) throw new Error("Project not found");

  const manager =
    patch.manager !== undefined
      ? patch.manager.trim()
      : patch.managerName !== undefined
        ? patch.managerName.trim()
        : undefined;

  const next = {
    ...current,
    ...patch,
    ...(patch.address !== undefined
      ? { address: patch.address.trim() }
      : {}),
    ...(patch.clientName !== undefined
      ? { clientName: patch.clientName.trim() }
      : {}),
    ...(manager !== undefined
      ? { manager, managerName: manager }
      : {}),
    ...(patch.internalNotes !== undefined
      ? { internalNotes: patch.internalNotes.trim() }
      : {}),
    updatedAt: new Date().toISOString(),
  } as Project;

  next.forecastStatus =
    patch.forecastStatus || deriveForecastStatus(next);

  if (AUTH_BYPASS) {
    demoProjects = demoProjects.map((p) => (p.id === projectId ? next : p));
    return next;
  }

  const { id: _id, ...data } = next;
  await updateDoc(doc(getFirebaseDb(), projectsPath(), projectId), data);
  return next;
}

export async function markProjectCompleted(projectId: string) {
  const now = new Date().toISOString();
  return updateProject(projectId, {
    status: "completed",
    actualCompletionDate: now.slice(0, 10),
  });
}

export async function saveTour3dLink(
  projectId: string,
  tour3dUrl: string,
  tour3dLabel?: string,
) {
  return updateProject(projectId, {
    tour3dUrl: tour3dUrl.trim() || undefined,
    tour3dLabel: tour3dLabel?.trim() || undefined,
  });
}

export async function uploadProject3dImages(
  projectId: string,
  files: File[],
  onProgress?: (fileName: string, pct: number) => void,
) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");

  const uploaded: Project3DImage[] = [];

  for (const file of files) {
    if (!isImageFile(file)) continue;

    if (AUTH_BYPASS) {
      onProgress?.(file.name, 100);
      uploaded.push({
        id: `demo-3d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        downloadUrl: URL.createObjectURL(file),
        storagePath: `demo/3d/${file.name}`,
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = storage3dPath(
      projectId,
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`,
    );
    const storageRef = ref(getFirebaseStorage(), path);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });

    await new Promise<UploadTaskSnapshot>((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          onProgress?.(
            file.name,
            Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          );
        },
        reject,
        () => resolve(task.snapshot),
      );
    });

    const downloadUrl = await getDownloadURL(task.snapshot.ref);
    uploaded.push({
      id: `3d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      downloadUrl,
      storagePath: path,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
    });
  }

  if (!uploaded.length) return project;

  const nextImages = [...uploaded, ...(project.images3d || [])];
  const shouldSelect =
    !project.overview3dImageId ||
    !(project.images3d || []).some((img) => img.id === project.overview3dImageId);

  return updateProject(projectId, {
    images3d: nextImages,
    storageBytes:
      project.storageBytes +
      uploaded.reduce((sum, item) => sum + item.sizeBytes, 0),
    ...(shouldSelect
      ? {
          overview3dImageId: uploaded[0].id,
          coverPhotoUrl: uploaded[0].downloadUrl,
        }
      : {}),
  });
}

export async function removeProject3dImage(
  projectId: string,
  imageId: string,
) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  const nextImages = (project.images3d || []).filter((img) => img.id !== imageId);
  const removed = (project.images3d || []).find((img) => img.id === imageId);
  const clearingSelected = project.overview3dImageId === imageId;
  return updateProject(projectId, {
    images3d: nextImages,
    storageBytes: Math.max(
      0,
      project.storageBytes - (removed?.sizeBytes || 0),
    ),
    ...(clearingSelected
      ? {
          overview3dImageId: nextImages[0]?.id,
          coverPhotoUrl: nextImages[0]?.downloadUrl || project.coverPhotoUrl,
        }
      : {}),
  });
}

export async function selectOverview3dImage(
  projectId: string,
  imageId: string,
) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  const image = (project.images3d || []).find((img) => img.id === imageId);
  if (!image) throw new Error("3D image not found");
  return updateProject(projectId, {
    overview3dImageId: image.id,
    coverPhotoUrl: image.downloadUrl,
  });
}
