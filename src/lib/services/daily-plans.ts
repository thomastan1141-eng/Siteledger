import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "../firebase";
import { AUTH_BYPASS } from "../demo";
import { COMPANY_ID, DEFAULT_WORK_ITEM_COLOR } from "../constants";
import { dailyPlansPath, requireTenantId } from "../paths";
import { sanitizeForFirestore } from "../sanitize";
import type { DailyPlan, DailyPlanWorkItem } from "../types";

let demoPlans: DailyPlan[] = [
  {
    id: "plan-bw-2026-08-03",
    projectId: "demo-berwick",
    companyId: COMPANY_ID,
    date: "2026-08-03",
    items: [
      { workText: "Electrical work", color: "#c96f45" },
      { workText: "Site inspection", color: "#52705d" },
    ],
    note: "Coordinator on site after lunch.",
    createdAt: "2026-08-02T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
  },
  {
    id: "plan-bw-2026-08-05",
    projectId: "demo-berwick",
    companyId: COMPANY_ID,
    date: "2026-08-05",
    items: [{ workText: "Tiling work", color: "#4a5d73" }],
    reminder: "Tile delivery check",
    createdAt: "2026-08-02T10:00:00.000Z",
    updatedAt: "2026-08-02T10:00:00.000Z",
  },
];

export async function listDailyPlans(
  projectId: string,
  options?: { year?: number; month?: number; workspaceId?: string },
) {
  const ws = requireTenantId(options?.workspaceId);
  let plans: DailyPlan[];

  if (AUTH_BYPASS) {
    plans = demoPlans.filter((p) => p.projectId === projectId);
  } else {
    const snap = await getDocs(
      collection(getFirebaseDb(), dailyPlansPath(projectId, ws)),
    );
    plans = snap.docs.map(
      (d) => ({ id: d.id, ...(d.data() as Omit<DailyPlan, "id">) }) as DailyPlan,
    );
  }

  if (options?.year && options?.month) {
    const prefix = `${options.year}-${String(options.month).padStart(2, "0")}`;
    plans = plans.filter((p) => p.date.startsWith(prefix));
  }

  return plans.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getDailyPlan(
  projectId: string,
  date: string,
  workspaceId?: string,
) {
  const plans = await listDailyPlans(projectId, { workspaceId });
  return plans.find((p) => p.date === date) || null;
}

export async function saveDailyPlan(input: {
  projectId: string;
  date: string;
  items: DailyPlanWorkItem[];
  reminder?: string;
  note?: string;
  workspaceId?: string;
}) {
  const ws = requireTenantId(input.workspaceId);
  const items = input.items
    .map((item) => ({
      workText: item.workText.trim(),
      color: item.color || DEFAULT_WORK_ITEM_COLOR,
    }))
    .filter((item) => item.workText)
    .slice(0, 4);

  const now = new Date().toISOString();
  const id = input.date;
  const existing = await getDailyPlan(input.projectId, input.date, ws);

  const plan = sanitizeForFirestore({
    id,
    projectId: input.projectId,
    companyId: ws,
    date: input.date,
    items,
    reminder: input.reminder?.trim() || null,
    note: input.note?.trim() || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }) as DailyPlan;

  if (AUTH_BYPASS) {
    demoPlans = [
      plan,
      ...demoPlans.filter(
        (p) => !(p.projectId === input.projectId && p.date === input.date),
      ),
    ];
    return plan;
  }

  const { id: _id, ...payload } = plan;
  await setDoc(
    doc(getFirebaseDb(), dailyPlansPath(input.projectId, ws), id),
    payload,
    { merge: true },
  );
  return plan;
}

export async function listClientVisiblePlans(
  projectId: string,
  workspaceId?: string,
) {
  const plans = await listDailyPlans(projectId, { workspaceId });
  return plans.filter((plan) => plan.items.length > 0 || plan.note);
}
