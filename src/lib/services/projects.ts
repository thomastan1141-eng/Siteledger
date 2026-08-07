import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
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
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from "../firebase";
import { COMPANY_ID } from "../constants";
import { AUTH_BYPASS, DEMO_PROJECTS } from "../demo";
import { OWNER_PERMISSIONS } from "../permissions";
import {
  LEGACY_TENANT_ID,
  LISTABLE_PROJECT_STATUSES,
  projectsPath,
  requireTenantId,
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
  ColleaguePermissions,
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

function requireWorkspaceId(workspaceId?: string | null) {
  return requireTenantId(workspaceId);
}

function sortByUpdatedAtDesc(projects: Project[]) {
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Statuses allowed in Client list queries (must match readable Rules set). */
function listableStatuses(filter?: ProjectStatus): ProjectStatus[] {
  if (!filter) return [...LISTABLE_PROJECT_STATUSES];
  if (filter === "trashed" || filter === "purging") {
    throw new Error("Use listTrashedProjects for deleted projects.");
  }
  return [filter];
}

export async function listProjects(options?: {
  status?: ProjectStatus;
  staffId?: string;
  /** Rules-safe owner discovery: createdBy == uid + listable status. */
  createdByUid?: string;
  workspaceId?: string;
}) {
  const ws = requireTenantId(
    options?.workspaceId || undefined,
  );
  const statuses = listableStatuses(options?.status);

  if (AUTH_BYPASS) {
    let projects = [...demoProjects]
      .filter((p) => (p.workspaceId || COMPANY_ID) === ws)
      .filter((p) => statuses.includes(p.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (options?.createdByUid) {
      projects = projects.filter((p) => p.createdBy === options.createdByUid);
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

  if (options?.createdByUid) {
    const ownedQuery = query(
      col,
      where("createdBy", "==", options.createdByUid),
      where("status", "in", statuses),
    );
    const snap = await getDocs(ownedQuery);
    return sortByUpdatedAtDesc(
      snap.docs
        .map((d) => mapProject(d.id, d.data()))
        .filter((p) => (p.workspaceId || p.companyId || COMPANY_ID) === ws),
    );
  }

  // Colleague index: staffIds + listable status (Rules-authorizable).
  if (options?.staffId) {
    const staffQuery = query(
      col,
      where("staffIds", "array-contains", options.staffId),
      where("status", "in", statuses),
    );
    const snap = await getDocs(staffQuery);
    return sortByUpdatedAtDesc(
      snap.docs
        .map((d) => mapProject(d.id, d.data()))
        .filter((p) => (p.workspaceId || p.companyId || COMPANY_ID) === ws),
    );
  }

  // Company-admin full list for one tenant (caller must be company admin).
  const q = query(
    col,
    where("workspaceId", "==", ws),
    where("status", "in", statuses),
  );

  try {
    const snap = await getDocs(q);
    return sortByUpdatedAtDesc(snap.docs.map((d) => mapProject(d.id, d.data())));
  } catch (err) {
    // Legacy docs missing workspaceId: path-scoped status filter only.
    console.warn("[listProjects] scoped query failed, falling back", err);
    const snap = await getDocs(query(col, where("status", "in", statuses)));
    return sortByUpdatedAtDesc(
      snap.docs
        .map((d) => mapProject(d.id, d.data()))
        .filter(
          (p) =>
            (p.workspaceId || p.companyId || COMPANY_ID) === ws ||
            !p.workspaceId,
        ),
    );
  }
}

/** Resolve home + shared workspaces without mutating defaultWorkspaceId. */
export function workspaceIdsForProfile(profile?: {
  defaultWorkspaceId?: string | null;
  companyId?: string | null;
  sharedWorkspaceIds?: string[] | null;
} | null) {
  return Array.from(
    new Set(
      [
        profile?.defaultWorkspaceId,
        profile?.companyId,
        ...(profile?.sharedWorkspaceIds || []),
      ]
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ),
  );
}

/** Project with USER-scoped discovery metadata (owner flag + shared count). */
export type MyProject = Project & {
  isOwner?: boolean;
  sharedActiveCount?: number;
  memberType?: string | null;
  permissionPreset?: string | null;
  /** Normalized permission map — see resolveEffectivePermissions on the server. */
  effectivePermissions?: ColleaguePermissions | null;
};

/**
 * Server-authenticated Project discovery for the signed-in USER: everything
 * they created, merged with everything they hold an ACTIVE membership for.
 * Never uses users/{uid}.role, company admin or workspace owner status —
 * see GET /api/projects/list and src/lib/server/project-directory.ts.
 */
export async function fetchMyProjects(): Promise<MyProject[]> {
  if (AUTH_BYPASS) {
    return [...demoProjects].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  const current = getFirebaseAuth().currentUser;
  if (!current) return [];
  const token = await current.getIdToken();
  const res = await fetch("/api/projects/list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { projects?: MyProject[]; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "We could not load your projects.");
  }
  return data.projects || [];
}

export type ResolvedProject = {
  workspaceId: string;
  project: Project;
  isOwner: boolean;
  /** UI-hint only — Firestore/Storage Rules and server APIs re-check the
   *  member doc themselves; never trust this for authorization decisions. */
  memberType: string | null;
  permissionPreset: string | null;
  /** Normalized permission map for UI gating — see resolveEffectivePermissions
   *  on the server. Servers/Rules independently re-enforce every write. */
  effectivePermissions: ColleaguePermissions | null;
};

/**
 * Resolve a single Project by id for the signed-in USER, returning its real
 * workspaceId. Never assumes the caller's defaultWorkspaceId — required for
 * shared Projects living in another USER's workspace.
 */
export async function fetchProjectResolve(
  projectId: string,
  workspaceIdHint?: string,
): Promise<ResolvedProject | null> {
  if (AUTH_BYPASS) {
    const project = demoProjects.find((p) => p.id === projectId) || null;
    if (!project) return null;
    return {
      workspaceId: project.workspaceId || COMPANY_ID,
      project,
      isOwner: true,
      memberType: "OWNER",
      permissionPreset: "OWNER",
      effectivePermissions: { ...OWNER_PERMISSIONS },
    };
  }
  const current = getFirebaseAuth().currentUser;
  if (!current) return null;
  const token = await current.getIdToken();
  const params = new URLSearchParams({ projectId });
  if (workspaceIdHint) params.set("workspaceId", workspaceIdHint);
  const res = await fetch(`/api/projects/resolve?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  const data = (await res.json()) as ResolvedProject & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "We could not load this project.");
  }
  return {
    workspaceId: data.workspaceId,
    project: data.project,
    isOwner: data.isOwner,
    memberType: data.memberType ?? null,
    permissionPreset: data.permissionPreset ?? null,
    effectivePermissions: data.effectivePermissions ?? null,
  };
}

/** Creator-only: list soft-deleted projects. Must filter createdBy for rules. */
export async function listTrashedProjects(
  workspaceId?: string,
  createdByUid?: string,
) {
  const ws = requireTenantId(workspaceId);
  if (AUTH_BYPASS) {
    return demoProjects.filter(
      (p) =>
        (p.workspaceId || COMPANY_ID) === ws &&
        p.status === "trashed" &&
        (!createdByUid || p.createdBy === createdByUid),
    );
  }
  if (!createdByUid) return [];

  const col = collection(getFirebaseDb(), projectsPath(ws));
  // Rules only allow creators to read trashed docs — query must include createdBy.
  const q = query(
    col,
    where("status", "==", "trashed"),
    where("createdBy", "==", createdByUid),
  );
  try {
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapProject(d.id, d.data()))
      .sort((a, b) =>
        String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")),
      );
  } catch (err) {
    console.warn("[listTrashedProjects]", err);
    return [];
  }
}

export async function listClientProjects(
  clientUid: string,
  workspaceId?: string | string[],
) {
  if (AUTH_BYPASS) {
    const wsList = Array.isArray(workspaceId)
      ? workspaceId
      : [workspaceId?.trim() || COMPANY_ID];
    return demoProjects
      .filter(
        (p) =>
          p.clientUserIds?.includes(clientUid) &&
          wsList.includes(p.workspaceId || COMPANY_ID) &&
          LISTABLE_PROJECT_STATUSES.includes(p.status),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const candidates = Array.from(
    new Set(
      (
        Array.isArray(workspaceId)
          ? workspaceId
          : [workspaceId?.trim(), LEGACY_TENANT_ID]
      ).filter(Boolean) as string[],
    ),
  );

  const all: Project[] = [];
  for (const ws of candidates) {
    const col = collection(getFirebaseDb(), projectsPath(ws));
    const q = query(
      col,
      where("clientUserIds", "array-contains", clientUid),
      where("status", "in", LISTABLE_PROJECT_STATUSES),
    );
    try {
      const snap = await getDocs(q);
      all.push(...snap.docs.map((d) => mapProject(d.id, d.data())));
    } catch (err) {
      console.warn("[listClientProjects]", ws, err);
    }
  }

  const seen = new Set<string>();
  return sortByUpdatedAtDesc(
    all.filter((p) => {
      const key = `${p.workspaceId || p.companyId}:${p.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

export async function getProject(
  projectId: string,
  workspaceId?: string | string[],
) {
  const candidates = Array.from(
    new Set(
      (Array.isArray(workspaceId)
        ? workspaceId
        : [workspaceId?.trim(), LEGACY_TENANT_ID]
      )
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ),
  );
  if (AUTH_BYPASS) {
    return demoProjects.find((p) => p.id === projectId) || null;
  }
  for (const ws of candidates) {
    try {
      const snap = await getDoc(
        doc(getFirebaseDb(), projectsPath(requireTenantId(ws)), projectId),
      );
      if (snap.exists()) return mapProject(snap.id, snap.data());
    } catch {
      // try next workspace
    }
  }
  return null;
}

export type CreateProjectResult = {
  project: Project;
  photoWarning?: string;
};

export async function createProject(
  input: ProjectInput & { coverFile?: File | null },
): Promise<CreateProjectResult> {
  const workspaceId = requireWorkspaceId(input.workspaceId);
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
  const authUid =
    !AUTH_BYPASS && getFirebaseAuth().currentUser?.uid
      ? getFirebaseAuth().currentUser!.uid
      : optionalString(input.createdBy);
  if (!authUid) {
    throw new Error("Please sign in again before creating a project.");
  }
  const createdBy = authUid;
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
