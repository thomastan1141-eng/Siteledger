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
import { db } from "../firebase";
import { COMPANY_ID } from "../constants";
import { AUTH_BYPASS } from "../demo";
import { remindersPath } from "../paths";
import { todayKey } from "../utils";
import { hasUpdateOnDate } from "./updates";
import type { Project, Reminder } from "../types";

export async function listOpenReminders() {
  if (AUTH_BYPASS) return [];

  const q = query(
    collection(db, remindersPath()),
    where("resolved", "==", false),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(
      (d) => ({ id: d.id, ...(d.data() as Omit<Reminder, "id">) }) as Reminder,
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function resolveReminder(id: string) {
  await updateDoc(doc(db, remindersPath(), id), { resolved: true });
}

export async function createReminder(
  input: Omit<Reminder, "id" | "companyId" | "createdAt" | "resolved">,
) {
  const data: Omit<Reminder, "id"> = {
    ...input,
    companyId: COMPANY_ID,
    resolved: false,
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, remindersPath()), data);
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

    const updatedToday = await hasUpdateOnDate(project.id, today);
    if (!updatedToday) {
      alerts.push({
        projectId: project.id,
        projectName: project.name,
        type: "missing_today",
        message: `${project.name} has not been updated today.`,
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
          projectName: project.name,
          type: "stale",
          message: `This project has not received a site update for ${days} days.`,
        });
      }
    }

    if (project.forecastStatus === "delayed" || project.forecastStatus === "slight_delay") {
      alerts.push({
        projectId: project.id,
        projectName: project.name,
        type: "delayed",
        message: `${project.name} is currently ${project.forecastStatus === "delayed" ? "delayed" : "slightly delayed"}.`,
      });
    }

    if (project.forecastCompletionDate) {
      const daysLeft = differenceInCalendarDays(
        parseISO(project.forecastCompletionDate),
        new Date(),
      );
      if ([30, 14, 7, 3].includes(daysLeft)) {
        alerts.push({
          projectId: project.id,
          projectName: project.name,
          type: "completion_soon",
          message: `${project.name} forecast completion is in ${daysLeft} days. Please confirm the date.`,
        });
      }
    }
  }

  return alerts;
}
