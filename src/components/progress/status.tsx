import {
  FORECAST_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  SCHEDULE_STATUS_LABELS,
  type ForecastStatus,
  type ProjectStatus,
  type ScheduleStatus,
} from "@/lib/types";
import { SitePill } from "./primitives";

export function ProjectStatusPill({ status }: { status: ProjectStatus }) {
  const tone =
    status === "completed"
      ? "success"
      : status === "on_hold" || status === "archived"
        ? "warning"
        : status === "in_progress"
          ? "accent"
          : "neutral";
  return <SitePill tone={tone}>{PROJECT_STATUS_LABELS[status]}</SitePill>;
}

export function ForecastPill({ status }: { status: ForecastStatus }) {
  const tone =
    status === "on_track" || status === "ahead"
      ? "success"
      : status === "slight_delay"
        ? "warning"
        : "danger";
  return <SitePill tone={tone}>{FORECAST_STATUS_LABELS[status]}</SitePill>;
}

export function ScheduleStatusPill({ status }: { status: ScheduleStatus }) {
  const tone =
    status === "completed"
      ? "success"
      : status === "delayed"
        ? "danger"
        : status === "ongoing"
          ? "accent"
          : status === "on_hold"
            ? "warning"
            : "neutral";
  return <SitePill tone={tone}>{SCHEDULE_STATUS_LABELS[status]}</SitePill>;
}
