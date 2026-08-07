import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseDb } from "../firebase";
import { AUTH_BYPASS, DEMO_SCHEDULE } from "../demo";
import { requireTenantId, schedulePath } from "../paths";
import { sanitizeForFirestore } from "../sanitize";
import { normalizeStage, summarizeProjectStages } from "../utils";
import type { ScheduleItem, ScheduleStatus } from "../types";

let demoSchedule: ScheduleItem[] = DEMO_SCHEDULE.map((item) =>
  normalizeStage({ ...item }),
);

export type ScheduleInput = {
  name: string;
  source?: "preset" | "custom";
  categoryId?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  reminderDate?: string;
  status?: ScheduleStatus;
  barColor?: string;
  clientVisible?: boolean;
  internalNotes?: string;
  sortOrder?: number;
  createdBy?: string;
  workspaceId?: string;
};

function mapStage(id: string, data: Record<string, unknown>): ScheduleItem {
  return normalizeStage({
    id,
    ...(data as Omit<ScheduleItem, "id">),
  });
}

function resolveWorkspace(workspaceId?: string | null) {
  return requireTenantId(workspaceId);
}

export async function listSchedule(
  projectId: string,
  options?: { clientOnly?: boolean; workspaceId?: string },
) {
  const ws = resolveWorkspace(options?.workspaceId);
  let items: ScheduleItem[];

  if (AUTH_BYPASS) {
    items = demoSchedule
      .filter((item) => item.projectId === projectId)
      .map((item) => normalizeStage(item))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (options?.clientOnly) {
      items = items.filter((item) => item.clientVisible !== false);
    }
  } else if (options?.clientOnly) {
    // Query excludes non-client-visible stages directly, matching the
    // Firestore Rule for a Client member — a Client's read must never
    // depend on client-side filtering, since Rules deny the whole list
    // request if any candidate document wouldn't satisfy the rule.
    const snap = await getDocs(
      query(
        collection(getFirebaseDb(), schedulePath(projectId, ws)),
        where("clientVisible", "==", true),
        orderBy("sortOrder", "asc"),
      ),
    );
    items = snap.docs
      .map((d) => mapStage(d.id, d.data()))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } else {
    const q = query(
      collection(getFirebaseDb(), schedulePath(projectId, ws)),
      orderBy("sortOrder", "asc"),
    );
    const snap = await getDocs(q);
    items = snap.docs
      .map((d) => mapStage(d.id, d.data()))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return items;
}

export async function createScheduleItem(
  projectId: string,
  input: ScheduleInput,
  workspaceId?: string,
) {
  const ws = resolveWorkspace(workspaceId || input.workspaceId);
  const now = new Date().toISOString();
  const data = sanitizeForFirestore({
    projectId,
    companyId: ws,
    name: input.name.trim(),
    normalizedName: input.name.trim().toLowerCase(),
    source: input.source || "custom",
    categoryId: input.categoryId ?? null,
    plannedStartDate: input.plannedStartDate ?? null,
    plannedEndDate: input.plannedEndDate ?? null,
    actualStartDate: input.actualStartDate ?? null,
    actualEndDate: input.actualEndDate ?? null,
    reminderDate: input.reminderDate ?? null,
    status: input.status || "not_started",
    barColor: input.barColor ?? null,
    clientVisible: input.clientVisible !== false,
    internalNotes: input.internalNotes ?? null,
    sortOrder: input.sortOrder ?? 0,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  }) as Omit<ScheduleItem, "id">;

  if (AUTH_BYPASS) {
    const item = normalizeStage({ id: `demo-s-${Date.now()}`, ...data });
    demoSchedule = [...demoSchedule, item];
    return item;
  }

  const ref = await addDoc(
    collection(getFirebaseDb(), schedulePath(projectId, ws)),
    data,
  );
  return normalizeStage({ id: ref.id, ...data });
}

export async function createManyStages(
  projectId: string,
  names: Array<{
    name: string;
    source?: "preset" | "custom";
    plannedStartDate?: string;
    plannedEndDate?: string;
    clientVisible?: boolean;
    internalNotes?: string;
  }>,
  createdBy?: string,
  workspaceId?: string,
) {
  const existing = await listSchedule(projectId, { workspaceId });
  const created: ScheduleItem[] = [];
  let order = existing.length;

  for (const entry of names) {
    const name = entry.name.trim();
    if (!name) continue;
    if (
      existing.some((e) => e.name.toLowerCase() === name.toLowerCase()) ||
      created.some((e) => e.name.toLowerCase() === name.toLowerCase())
    ) {
      continue;
    }
    created.push(
      await createScheduleItem(
        projectId,
        {
          name,
          source: entry.source || "preset",
          plannedStartDate: entry.plannedStartDate,
          plannedEndDate: entry.plannedEndDate,
          clientVisible: entry.clientVisible !== false,
          internalNotes: entry.internalNotes,
          sortOrder: order,
          createdBy,
          workspaceId,
        },
        workspaceId,
      ),
    );
    order += 1;
  }

  return created;
}

export async function updateScheduleItem(
  projectId: string,
  itemId: string,
  patch: Partial<ScheduleInput> & { name?: string },
  workspaceId?: string,
) {
  const ws = resolveWorkspace(workspaceId || patch.workspaceId);
  const normalized: Record<string, unknown> = {
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  delete normalized.workspaceId;
  if (patch.name !== undefined) {
    normalized.name = patch.name.trim();
    normalized.normalizedName = patch.name.trim().toLowerCase();
  }
  if (patch.internalNotes !== undefined) {
    normalized.internalNotes = patch.internalNotes || "";
  }
  if (patch.clientVisible !== undefined) {
    normalized.clientVisible = patch.clientVisible;
  }

  const payload = sanitizeForFirestore(normalized);

  if (AUTH_BYPASS) {
    demoSchedule = demoSchedule.map((item) =>
      item.id === itemId
        ? normalizeStage({ ...item, ...payload } as ScheduleItem)
        : item,
    );
    return;
  }
  await updateDoc(
    doc(getFirebaseDb(), schedulePath(projectId, ws), itemId),
    payload,
  );
}

export async function setAllBarColors(
  projectId: string,
  itemIds: string[],
  barColor: string,
  workspaceId?: string,
) {
  const ws = resolveWorkspace(workspaceId);
  const updatedAt = new Date().toISOString();
  if (AUTH_BYPASS) {
    demoSchedule = demoSchedule.map((item) =>
      item.projectId === projectId && itemIds.includes(item.id)
        ? { ...item, barColor, updatedAt }
        : item,
    );
    return;
  }

  const batch = writeBatch(getFirebaseDb());
  itemIds.forEach((id) => {
    batch.update(doc(getFirebaseDb(), schedulePath(projectId, ws), id), {
      barColor,
      updatedAt,
    });
  });
  await batch.commit();
}

export async function reorderStages(
  projectId: string,
  orderedIds: string[],
  workspaceId?: string,
) {
  const ws = resolveWorkspace(workspaceId);
  if (AUTH_BYPASS) {
    demoSchedule = demoSchedule.map((item) => {
      if (item.projectId !== projectId) return item;
      const index = orderedIds.indexOf(item.id);
      if (index < 0) return item;
      return { ...item, sortOrder: index, updatedAt: new Date().toISOString() };
    });
    return;
  }

  const batch = writeBatch(getFirebaseDb());
  orderedIds.forEach((id, index) => {
    batch.update(doc(getFirebaseDb(), schedulePath(projectId, ws), id), {
      sortOrder: index,
      updatedAt: new Date().toISOString(),
    });
  });
  await batch.commit();
}

export async function deleteScheduleItem(
  projectId: string,
  itemId: string,
  workspaceId?: string,
) {
  const ws = resolveWorkspace(workspaceId);
  if (AUTH_BYPASS) {
    demoSchedule = demoSchedule.filter((item) => item.id !== itemId);
    return;
  }
  await deleteDoc(doc(getFirebaseDb(), schedulePath(projectId, ws), itemId));
}

export function summarizeSchedule(items: ScheduleItem[]) {
  return summarizeProjectStages(items);
}
