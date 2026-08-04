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
import {
  projectsPath,
  storage3dPath,
  storageCoverPath,
  tenantId,
} from "../paths";
import {
  optionalDateString,
  optionalString,
  sanitizeForFirestore,
} from "../sanitize";
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
  workspaceId: p.workspaceId || COMPANY_ID,
}));

export type ProjectInput = {
  workspaceId?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  clientName?: string | null;
  address?: string | null;
  coverPhotoUrl?: string | null;
  tour3dUrl?: string | null;
  tour3dLabel?: string | null;
  images3d?: Project3DImage[];
  overview3dImageId?: string | null;
  startDate?: string | null;
  contractCompletionDate?: string | null;
  forecastCompletionDate?: string | null;
  manager?: string | null;
  /** @deprecated */
  managerId?: string | null;
  /** @deprecated */
  managerName?: string | null;
  status?: ProjectStatus | null;
  internalNotes?: string | null;
  staffIds?: string[];
  clientUserIds?: string[];
  allowStaffPublish?: boolean;
  allowClientDownload?: boolean;
  purchaseSettings?: {
    rmbToSgdRate: number;
  } | null;
  dailyReminderHour?: number;
  staleDaysThreshold?: number;
};

function mapProject(id: string, data: Record<string, unknown>): Project {
  const address = optionalString(String(data.address ?? ""));
  const clientName = optionalString(String(data.clientName ?? ""));
  const manager = optionalString(
    String(data.manager ?? data.managerName ?? ""),
  );
  const workspaceId = String(
    data.workspaceId || data.companyId || COMPANY_ID,
  );
  const project = {
    id,
    ...(data as Omit<Project, "id">),
    workspaceId,
    companyId: String(data.companyId || workspaceId),
    address,
    clientName,
    manager,
    managerName: manager,
    coverPhotoUrl: optionalString(String(data.coverPhotoUrl ?? "")),
    name: data.name ? String(data.name) : null,
    code: data.code ? String(data.code) : null,
    status: (data.status as ProjectStatus) || "upcoming",
    clientUserIds: Array.isArray(data.clientUserIds)
      ? (data.clientUserIds as string[])
      : [],
    staffIds: Array.isArray(data.staffIds) ? (data.staffIds as string[]) : [],
    staleDaysThreshold:
      typeof data.staleDaysThreshold === "number"
        ? data.staleDaysThreshold
        : 3,
    allowStaffPublish: Boolean(data.allowStaffPublish),
    allowClientDownload: Boolean(data.allowClientDownload),
    photoCount: Number(data.photoCount || 0),
    videoCount: Number(data.videoCount || 0),
    storageBytes: Number(data.storageBytes || 0),
  };
  return {
    ...project,
    forecastStatus: project.forecastStatus || deriveForecastStatus(project),
  };
}

function resolveTenant(workspaceId?: string | null) {
  return tenantId(workspaceId);
}

export async function listProjects(options?: {
  status?: ProjectStatus;
  staffId?: string;
  workspaceId?: string;
}) {
  const ws = resolveTenant(options?.workspaceId);

  if (AUTH_BYPASS) {
    let projects = [...demoProjects]
      .filter((p) => (p.workspaceId || COMPANY_ID) === ws)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

  const col = collection(getFirebaseDb(), projectsPath(ws));
  // Path already scopes to workspace; also filter workspaceId for defense in depth.
  const q = query(
    col,
    where("workspaceId", "==", ws),
    orderBy("updatedAt", "desc"),
  );

  try {
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
  } catch (err) {
    // Fallback for legacy docs missing workspaceId / missing composite index.
    console.warn("[listProjects] scoped query failed, falling back", err);
    const snap = await getDocs(query(col, orderBy("updatedAt", "desc")));
    let projects = snap.docs
      .map((d) => mapProject(d.id, d.data()))
      .filter(
        (p) =>
          (p.workspaceId || p.companyId || COMPANY_ID) === ws ||
          !p.workspaceId,
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
}

export async function listClientProjects(
  clientUid: string,
  workspaceId?: string,
) {
  const ws = resolveTenant(workspaceId);

  if (AUTH_BYPASS) {
    return demoProjects
      .filter(
        (p) =>
          p.clientUserIds?.includes(clientUid) &&
          (p.workspaceId || COMPANY_ID) === ws,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const col = collection(getFirebaseDb(), projectsPath(ws));
  const q = query(col, where("clientUserIds", "array-contains", clientUid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => mapProject(d.id, d.data()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(
  projectId: string,
  workspaceId?: string,
) {
  const ws = resolveTenant(workspaceId);
  if (AUTH_BYPASS) {
    return demoProjects.find((p) => p.id === projectId) || null;
  }
  const snap = await getDoc(doc(getFirebaseDb(), projectsPath(ws), projectId));
  if (!snap.exists()) {
    // Legacy fallback: try default company path once.
    if (ws !== COMPANY_ID) {
      const legacy = await getDoc(
        doc(getFirebaseDb(), projectsPath(COMPANY_ID), projectId),
      );
      if (legacy.exists()) return mapProject(legacy.id, legacy.data());
    }
    return null;
  }
  return mapProject(snap.id, snap.data());
}

export type CreateProjectResult = {
  project: Project;
  photoWarning?: string;
};

export async function createProject(
  input: ProjectInput & { coverFile?: File | null },
): Promise<CreateProjectResult> {
  const workspaceId = resolveTenant(input.workspaceId);
  const address = optionalString(input.address);
  const clientName = optionalString(input.clientName);
  const manager = optionalString(input.manager || input.managerName);
  const internalNotes = optionalString(input.internalNotes);

  let startDate: string | null = null;
  let contractCompletionDate: string | null = null;
  let forecastCompletionDate: string | null = null;
  try {
    startDate = optionalDateString(input.startDate);
    contractCompletionDate = optionalDateString(input.contractCompletionDate);
    forecastCompletionDate = optionalDateString(
      input.forecastCompletionDate || input.contractCompletionDate,
    );
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "One of the dates is invalid.",
    );
  }

  const status = input.status || "upcoming";
  const createdBy = optionalString(input.createdBy);
  const now = new Date().toISOString();

  if (AUTH_BYPASS) {
    const created: Project = {
      id: `demo-${Date.now()}`,
      companyId: workspaceId,
      workspaceId,
      clientName,
      address,
      coverPhotoUrl: null,
      startDate,
      contractCompletionDate,
      forecastCompletionDate,
      manager,
      managerName: manager,
      status,
      forecastStatus: "on_track",
      clientUserIds: input.clientUserIds || [],
      staffIds: input.staffIds || [],
      internalNotes,
      dailyReminderHour: input.dailyReminderHour ?? 17,
      staleDaysThreshold: input.staleDaysThreshold ?? 3,
      allowStaffPublish: input.allowStaffPublish ?? false,
      allowClientDownload: input.allowClientDownload ?? false,
      tour3dUrl: optionalString(input.tour3dUrl),
      tour3dLabel: optionalString(input.tour3dLabel),
      images3d: input.images3d || [],
      photoCount: 0,
      videoCount: 0,
      storageBytes: 0,
      createdBy,
      updatedBy: createdBy,
      createdAt: now,
      updatedAt: now,
    };
    created.forecastStatus = deriveForecastStatus(created);
    demoProjects = [created, ...demoProjects];
    return { project: created };
  }

  const draft = sanitizeForFirestore({
    companyId: workspaceId,
    workspaceId,
    clientName,
    address,
    coverPhotoUrl: null,
    tour3dUrl: optionalString(input.tour3dUrl),
    tour3dLabel: optionalString(input.tour3dLabel),
    images3d: input.images3d || [],
    startDate,
    contractCompletionDate,
    forecastCompletionDate,
    manager,
    managerName: manager,
    status,
    forecastStatus: "on_track" as ForecastStatus,
    clientUserIds: input.clientUserIds || [],
    staffIds: input.staffIds || [],
    internalNotes,
    dailyReminderHour: input.dailyReminderHour ?? 17,
    staleDaysThreshold: input.staleDaysThreshold ?? 3,
    allowStaffPublish: input.allowStaffPublish ?? false,
    allowClientDownload: input.allowClientDownload ?? false,
    photoCount: 0,
    videoCount: 0,
    storageBytes: 0,
    createdBy,
    updatedBy: createdBy,
    createdAt: now,
    updatedAt: now,
  });

  draft.forecastStatus = deriveForecastStatus(draft as Project);

  let ref;
  try {
    ref = await addDoc(
      collection(getFirebaseDb(), projectsPath(workspaceId)),
      draft,
    );
  } catch (err) {
    console.error("[createProject]", err);
    throw new Error("We could not create the project. Please try again.");
  }

  const project: Project = { id: ref.id, ...(draft as Omit<Project, "id">) };
  let photoWarning: string | undefined;

  if (input.coverFile) {
    try {
      const url = await uploadCoverPhoto(
        workspaceId,
        ref.id,
        input.coverFile,
      );
      await updateDoc(doc(getFirebaseDb(), projectsPath(workspaceId), ref.id), {
        coverPhotoUrl: url,
        updatedAt: new Date().toISOString(),
      });
      project.coverPhotoUrl = url;
    } catch (err) {
      console.error("[createProject cover]", err);
      photoWarning =
        "The project was created, but the cover photo could not be uploaded. You can upload it later.";
    }
  }

  return { project, photoWarning };
}

export async function uploadCoverPhoto(
  workspaceId: string,
  projectId: string,
  file: File,
  onProgress?: (pct: number) => void,
) {
  if (!isImageFile(file)) {
    throw new Error("Cover photo must be an image.");
  }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = storageCoverPath(
    workspaceId,
    projectId,
    `${Date.now()}-${safe}`,
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
          Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
        );
      },
      reject,
      () => resolve(task.snapshot),
    );
  });
  return getDownloadURL(task.snapshot.ref);
}

export async function updateProject(
  projectId: string,
  patch: Partial<ProjectInput> & {
    forecastStatus?: ForecastStatus;
    actualCompletionDate?: string | null;
    lastUpdateAt?: string | null;
    lastClientUpdateAt?: string | null;
    photoCount?: number;
    videoCount?: number;
    storageBytes?: number;
  },
  workspaceId?: string,
) {
  const current = await getProject(projectId, workspaceId);
  if (!current) throw new Error("Project not found");
  const ws = resolveTenant(workspaceId || current.workspaceId);

  const nextPatch: Record<string, unknown> = { ...patch };
  if (patch.address !== undefined) {
    nextPatch.address = optionalString(patch.address);
  }
  if (patch.clientName !== undefined) {
    nextPatch.clientName = optionalString(patch.clientName);
  }
  if (patch.manager !== undefined || patch.managerName !== undefined) {
    const manager = optionalString(patch.manager ?? patch.managerName);
    nextPatch.manager = manager;
    nextPatch.managerName = manager;
  }
  if (patch.internalNotes !== undefined) {
    nextPatch.internalNotes = optionalString(patch.internalNotes);
  }
  if (patch.startDate !== undefined) {
    nextPatch.startDate = optionalDateString(patch.startDate);
  }
  if (patch.contractCompletionDate !== undefined) {
    nextPatch.contractCompletionDate = optionalDateString(
      patch.contractCompletionDate,
    );
  }
  if (patch.forecastCompletionDate !== undefined) {
    nextPatch.forecastCompletionDate = optionalDateString(
      patch.forecastCompletionDate,
    );
  }
  if (patch.coverPhotoUrl !== undefined) {
    nextPatch.coverPhotoUrl = optionalString(patch.coverPhotoUrl);
  }

  // Never allow client to reassign workspace.
  delete nextPatch.workspaceId;
  delete nextPatch.companyId;
  delete nextPatch.createdBy;

  const next = {
    ...current,
    ...nextPatch,
    workspaceId: current.workspaceId || ws,
    companyId: current.companyId || ws,
    updatedAt: new Date().toISOString(),
  } as Project;

  next.forecastStatus = patch.forecastStatus || deriveForecastStatus(next);

  if (AUTH_BYPASS) {
    demoProjects = demoProjects.map((p) => (p.id === projectId ? next : p));
    return next;
  }

  const { id: projectDocId, ...data } = next;
  void projectDocId;
  const payload = sanitizeForFirestore(data);
  await updateDoc(doc(getFirebaseDb(), projectsPath(ws), projectId), payload);
  return next;
}

export async function markProjectCompleted(
  projectId: string,
  workspaceId?: string,
) {
  const now = new Date().toISOString();
  return updateProject(
    projectId,
    {
      status: "completed",
      actualCompletionDate: now.slice(0, 10),
    },
    workspaceId,
  );
}

export async function saveTour3dLink(
  projectId: string,
  tour3dUrl: string,
  tour3dLabel?: string,
  workspaceId?: string,
) {
  return updateProject(
    projectId,
    {
      tour3dUrl: optionalString(tour3dUrl),
      tour3dLabel: optionalString(tour3dLabel),
    },
    workspaceId,
  );
}

export async function uploadProject3dImages(
  projectId: string,
  files: File[],
  onProgress?: (fileName: string, pct: number) => void,
  workspaceId?: string,
) {
  const project = await getProject(projectId, workspaceId);
  if (!project) throw new Error("Project not found");
  const ws = resolveTenant(workspaceId || project.workspaceId);

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
      ws,
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

  return updateProject(
    projectId,
    {
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
    },
    ws,
  );
}

export async function removeProject3dImage(
  projectId: string,
  imageId: string,
  workspaceId?: string,
) {
  const project = await getProject(projectId, workspaceId);
  if (!project) throw new Error("Project not found");
  const nextImages = (project.images3d || []).filter((img) => img.id !== imageId);
  const removed = (project.images3d || []).find((img) => img.id === imageId);
  const clearingSelected = project.overview3dImageId === imageId;
  return updateProject(
    projectId,
    {
      images3d: nextImages,
      storageBytes: Math.max(
        0,
        project.storageBytes - (removed?.sizeBytes || 0),
      ),
      ...(clearingSelected
        ? {
            overview3dImageId: nextImages[0]?.id || null,
            coverPhotoUrl: nextImages[0]?.downloadUrl || null,
          }
        : {}),
    },
    workspaceId || project.workspaceId,
  );
}

export async function selectOverview3dImage(
  projectId: string,
  imageId: string,
  workspaceId?: string,
) {
  const project = await getProject(projectId, workspaceId);
  if (!project) throw new Error("Project not found");
  const image = (project.images3d || []).find((img) => img.id === imageId);
  if (!image) throw new Error("3D image not found");
  return updateProject(
    projectId,
    {
      overview3dImageId: image.id,
      coverPhotoUrl: image.downloadUrl,
    },
    workspaceId || project.workspaceId,
  );
}
