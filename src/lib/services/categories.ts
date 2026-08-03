import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { COMPANY_ID, DEFAULT_WORK_CATEGORIES } from "../constants";
import { AUTH_BYPASS } from "../demo";
import { categoriesPath } from "../paths";
import type { WorkCategory } from "../types";

function demoCategories(): WorkCategory[] {
  return DEFAULT_WORK_CATEGORIES.map((name, index) => ({
    id: `cat-${index}`,
    companyId: COMPANY_ID,
    name,
    sortOrder: index,
    active: true,
  }));
}

export async function listWorkCategories() {
  if (AUTH_BYPASS) return demoCategories();

  const q = query(
    collection(db, categoriesPath()),
    orderBy("sortOrder", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) =>
      ({ id: d.id, ...(d.data() as Omit<WorkCategory, "id">) }) as WorkCategory,
  );
}

export async function seedDefaultWorkCategories() {
  if (AUTH_BYPASS) return demoCategories();

  const existing = await listWorkCategories();
  if (existing.length) return existing;

  const batch = writeBatch(db);
  const created: WorkCategory[] = [];

  DEFAULT_WORK_CATEGORIES.forEach((name, index) => {
    const ref = doc(collection(db, categoriesPath()));
    const data: Omit<WorkCategory, "id"> = {
      companyId: COMPANY_ID,
      name,
      sortOrder: index,
      active: true,
    };
    batch.set(ref, data);
    created.push({ id: ref.id, ...data });
  });

  await batch.commit();
  return created;
}

export async function createWorkCategory(name: string, sortOrder = 999) {
  const data: Omit<WorkCategory, "id"> = {
    companyId: COMPANY_ID,
    name,
    sortOrder,
    active: true,
  };
  const ref = await addDoc(collection(db, categoriesPath()), data);
  return { id: ref.id, ...data };
}

export async function setWorkCategoryActive(id: string, active: boolean) {
  await updateDoc(doc(db, categoriesPath(), id), { active });
}
