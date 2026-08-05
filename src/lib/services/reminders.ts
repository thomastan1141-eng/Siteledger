import {
  addDoc,
  collection,
  getDocs,
  query,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { getFirebaseDb } from "../firebase";
import { AUTH_BYPASS } from "../demo";
import { remindersPath, requireTenantId } from "../paths";
import { getProjectDisplayName, todayKey } from "../utils";
import { hasUpdateOnDate } from "./updates";
import type { Project, Reminder } from "../types";

export async function listOpenReminders(workspaceId?: string) {
  if (AUTH_BYPASS) return [];

  const ws = requireTenantId(workspaceId);
  const q = query(
    collection(getFirebaseDb(), remindersPath(ws)),
    where("resolved", "==", false),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Reminder, "id">) }) as Reminder,
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function resolveReminder(id: string, workspaceId?: string) {
  const ws = requireTenantId(workspaceId);
  await updateDoc(doc(getFirebaseDb(), remindersPath(ws), id), { resolved: true });
}

export async function createReminder(
  input: Omit<Reminder, "id" | "companyId" | "createdAt" | "resolved">,
  workspaceId?: string,
) {
  const ws = requireTenantId(workspaceId);
  const data: Omit<Reminder, "id"> = {
    ...input,
    companyId: ws,
    resolved: false,
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(getFirebaseDb(), remindersPath(ws)), data);
  return { id: ref.id, ...data };
}

/** Client-side daily checks shown on admin dashboard (email via Cloud Functions later). */
export async function buildDashboardAlerts(projects: Project[]) {
  const today = todayKey();
  const alerts: Array<{
    projectId: string;
    projectName: string;
    type: "missing_today" | "stale" | "completion_soon" | "delayed";
    message: string;
  }> = [];

  for (const project of projects) {
    if (project.status !== "in_progress") continue;

    const ws = project.workspaceId || project.companyId;
    let updatedToday = false;
    try {
      updatedToday = await hasUpdateOnDate(project.id, today, ws);
    } catch (err) {
      console.warn("[buildDashboardAlerts] hasUpdateOnDate", project.id, err);
    }
    if (!updatedToday) {
      const title = getProjectDisplayName(project);
      alerts.push({
        projectId: project.id,
        projectName: title,
        type: "missing_today",
        message: `${title} has not been updated today.`,
      });
    }

    if (project.lastUpdateAt) {
      const days = differenceInCalendarDays(
        new Date(),
        parseISO(project.lastUpdateAt),
      );
      if (days >= (project.staleDaysThreshold || 3)) {
        alerts.push({
          projectId: project.id,
          projectName: getProjectDisplayName(project),
          type: "stale",
          message: `This project has not received a site update for ${days} days.`,
        });
      }
    }

    if (project.forecastStatus === "delayed" || project.forecastStatus === "slight_delay") {
      {
        const title = getProjectDisplayName(project);
        alerts.push({
          projectId: project.id,
          projectName: title,
          type: "delayed",
          message: `${title} is currently ${project.forecastStatus === "delayed" ? "delayed" : "slightly delayed"}.`,
        });
      }
    }

    if (project.forecastCompletionDate) {
      const daysLeft = differenceInCalendarDays(
        parseISO(project.forecastCompletionDate),
        new Date(),
      );
      if ([30, 14, 7, 3].includes(daysLeft)) {
        {
          const title = getProjectDisplayName(project);
          alerts.push({
            projectId: project.id,
            projectName: title,
            type: "completion_soon",
            message: `${title} forecast completion is in ${daysLeft} days. Please confirm the date.`,
          });
        }
      }
    }
  }

  return alerts;
}
