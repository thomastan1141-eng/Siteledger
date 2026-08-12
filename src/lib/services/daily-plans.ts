import {

  collection,

  doc,

  getDocs,

  query,

  setDoc,

  where,

} from "firebase/firestore";

import { getFirebaseDb } from "../firebase";

import { AUTH_BYPASS } from "../demo";

import { COMPANY_ID, DEFAULT_WORK_ITEM_COLOR } from "../constants";

import { dailyPlansPath, requireTenantId } from "../paths";

import { sanitizeForFirestore } from "../sanitize";

import type { DailyPlan, DailyPlanWorkItem } from "../types";
import { eachDateKeyInclusive } from "../utils";



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

    clientVisible: true,

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

    clientVisible: true,

    reminder: "Tile delivery check",

    createdAt: "2026-08-02T10:00:00.000Z",

    updatedAt: "2026-08-02T10:00:00.000Z",

  },

];



/** Missing clientVisible behaves as true (same model as Schedule). */

export function isDailyPlanClientVisible(

  plan: Pick<DailyPlan, "clientVisible"> | null | undefined,

) {

  return plan?.clientVisible !== false;

}



export async function listDailyPlans(

  projectId: string,

  options?: {

    year?: number;

    month?: number;

    workspaceId?: string;

    clientOnly?: boolean;

  },

) {

  const ws = requireTenantId(options?.workspaceId);

  let plans: DailyPlan[];



  if (AUTH_BYPASS) {

    plans = demoPlans.filter((p) => p.projectId === projectId);

    if (options?.clientOnly) {

      plans = plans.filter(isDailyPlanClientVisible);

    }

  } else {

    const plansRef = collection(

      getFirebaseDb(),

      dailyPlansPath(projectId, ws),

    );

    // Client queries must constrain to clientVisible == true so Rules can

    // evaluate the list. Saves always stamp the field (default true); legacy

    // docs without the field remain readable by getDoc Rules but may not

    // appear in this query until re-saved.

    const snap = await getDocs(

      options?.clientOnly

        ? query(plansRef, where("clientVisible", "==", true))

        : plansRef,

    );

    plans = snap.docs.map(

      (d) => ({ id: d.id, ...(d.data() as Omit<DailyPlan, "id">) }) as DailyPlan,

    );

  }



  if (options?.clientOnly) {

    plans = plans.filter(isDailyPlanClientVisible);

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

  /** Defaults to true when omitted (Share with client). */

  clientVisible?: boolean;

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

    clientVisible: input.clientVisible !== false,

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

  const plans = await listDailyPlans(projectId, {

    workspaceId,

    clientOnly: true,

  });

  return plans.filter((plan) => plan.items.length > 0 || plan.note);

}

export async function saveDailyPlansInRange(input: {
  projectId: string;
  startDate: string;
  endDate?: string;
  items: DailyPlanWorkItem[];
  reminder?: string;
  note?: string;
  clientVisible?: boolean;
  workspaceId?: string;
}) {
  const end = (input.endDate || "").trim();
  const dates = eachDateKeyInclusive(
    input.startDate,
    end || input.startDate,
  );
  const saved: DailyPlan[] = [];
  for (const date of dates) {
    saved.push(
      await saveDailyPlan({
        projectId: input.projectId,
        date,
        items: input.items,
        reminder: input.reminder,
        note: input.note,
        clientVisible: input.clientVisible,
        workspaceId: input.workspaceId,
      }),
    );
  }
  return saved;
}
