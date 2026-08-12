import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  addDays,
  differenceInCalendarDays,
  format,
  getDay,
  isValid,
  parseISO,
  startOfWeek,
} from "date-fns";
import { SINGAPORE_TZ } from "./constants";
import type { ForecastStatus, Project, ScheduleItem } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Primary project title — address, else Untitled project. */
export function getProjectDisplayTitle(
  project?: Pick<Project, "address" | "name"> | null,
) {
  const address = (project?.address || "").trim();
  if (address) return address;
  return "Untitled project";
}

/** Alias — address title only (legacy projectName is not used for display). */
export function getProjectDisplayName(
  project?: Pick<Project, "address" | "name"> | null,
) {
  return getProjectDisplayTitle(project);
}

export function isProjectIncomplete(
  project?: Pick<Project, "address" | "clientName"> | null,
) {
  return !(project?.address || "").trim() || !(project?.clientName || "").trim();
}

export function getProjectManagerName(
  project?: Pick<Project, "manager" | "managerName"> | null,
) {
  return (project?.manager || project?.managerName || "").trim();
}

/** Search match: address, client name, manager (not project code). */
export function matchesProjectSearch(
  project: Pick<
    Project,
    "address" | "clientName" | "manager" | "managerName"
  >,
  query: string,
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    project.address,
    project.clientName,
    project.manager,
    project.managerName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function formatDate(value?: string | null, pattern = "d MMM yyyy") {
  if (!value) return "—";
  const date = parseISO(value);
  if (!isValid(date)) return value;
  return format(date, pattern);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = parseISO(value);
  if (!isValid(date)) return value;
  return format(date, "d MMM yyyy · HH:mm");
}

/** Calendar date key in Asia/Singapore. */
export function singaporeDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SINGAPORE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayKey(date = new Date()) {
  return singaporeDateKey(date);
}

/**
 * Inclusive calendar-day keys (yyyy-MM-dd). Swaps if end < start.
 * Uses UTC date parts so Singapore calendar keys iterate without DST skew.
 */
export function eachDateKeyInclusive(startKey: string, endKey: string): string[] {
  const start = (startKey || "").trim();
  const end = (endKey || "").trim() || start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return start ? [start] : [];
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const [sy, sm, sd] = from.split("-").map(Number);
  const [ey, em, ed] = to.split("-").map(Number);
  const cur = new Date(Date.UTC(sy!, sm! - 1, sd!));
  const last = new Date(Date.UTC(ey!, em! - 1, ed!));
  const out: string[] = [];
  while (cur.getTime() <= last.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function singaporeYearMonth(date = new Date()) {
  const key = singaporeDateKey(date);
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

/** Build month grid cells (Sun-start) for a real calendar month. */
export function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const start = startOfWeek(first, { weekStartsOn: 0 });
  const cells: Array<{
    date: Date;
    key: string;
    inMonth: boolean;
    day: number;
  }> = [];
  for (let i = 0; i < 42; i += 1) {
    const d = addDays(start, i);
    cells.push({
      date: d,
      key: format(d, "yyyy-MM-dd"),
      inMonth: d.getMonth() === month - 1,
      day: d.getDate(),
    });
  }
  return cells;
}

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function normalizeStage(item: ScheduleItem): ScheduleItem {
  return {
    ...item,
    source: item.source || "preset",
    clientVisible: item.clientVisible !== false,
    normalizedName: item.normalizedName || item.name.trim().toLowerCase(),
  };
}

export function summarizeProjectStages(stages: ScheduleItem[]) {
  const ordered = [...stages]
    .map(normalizeStage)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const ongoing = ordered.filter((i) => i.status === "ongoing");
  const completed = ordered.filter((i) => i.status === "completed");
  const byOrderNotStarted = ordered.find((i) => i.status === "not_started");
  const byNearestDate = [...ordered]
    .filter(
      (i) =>
        i.status !== "completed" &&
        i.status !== "ongoing" &&
        i.plannedStartDate,
    )
    .sort((a, b) =>
      (a.plannedStartDate || "9999").localeCompare(b.plannedStartDate || "9999"),
    )[0];
  const next = byOrderNotStarted || byNearestDate || undefined;
  return { ordered, ongoing, completed, next };
}

/** Week index 0–11 from timeline origin for a date key. */
export function weekIndexFromOrigin(originKey: string, dateKey?: string) {
  if (!dateKey) return null;
  const origin = parseISO(originKey);
  const date = parseISO(dateKey);
  if (!isValid(origin) || !isValid(date)) return null;
  const days = differenceInCalendarDays(date, origin);
  if (days < 0) return 0;
  return Math.min(11, Math.floor(days / 7));
}

/** Start date (yyyy-MM-dd) for a week index on the 12-week timeline. */
export function dateKeyFromWeekIndex(originKey: string, weekIndex: number) {
  const origin = parseISO(originKey);
  const clamped = Math.max(0, Math.min(11, weekIndex));
  return format(addDays(origin, clamped * 7), "yyyy-MM-dd");
}

/** End date (yyyy-MM-dd) for a week index on the 12-week timeline. */
export function dateKeyFromWeekEnd(originKey: string, weekIndex: number) {
  const origin = parseISO(originKey);
  const clamped = Math.max(0, Math.min(11, weekIndex));
  return format(addDays(origin, clamped * 7 + 6), "yyyy-MM-dd");
}

export function getTimelineOrigin(project: Project, stages: ScheduleItem[]) {
  /** Week 1 anchors to project commence date when set. */
  if (project.startDate) return project.startDate;
  const candidates = stages
    .map((s) => s.plannedStartDate)
    .filter(Boolean) as string[];
  if (!candidates.length) return singaporeDateKey();
  return candidates.sort()[0];
}

export function weekdayLabel(date: Date) {
  return getDay(date);
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function deriveForecastStatus(project: Project): ForecastStatus {
  if (
    !project.contractCompletionDate ||
    !project.forecastCompletionDate
  ) {
    return project.forecastStatus || "on_track";
  }

  const contract = parseISO(project.contractCompletionDate).getTime();
  const forecast = parseISO(project.forecastCompletionDate).getTime();
  const diffDays = Math.round((forecast - contract) / (1000 * 60 * 60 * 24));

  if (diffDays <= -3) return "ahead";
  if (diffDays <= 0) return "on_track";
  if (diffDays <= 7) return "slight_delay";
  return "delayed";
}

export function isImageFile(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.startsWith("image/") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png")
  );
}

export function isVideoFile(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.startsWith("video/") ||
    name.endsWith(".mp4") ||
    name.endsWith(".mov")
  );
}
