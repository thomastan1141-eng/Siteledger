"use client";

import Link from "next/link";
import {
  SiteButton,
  SitePageHeader,
  SitePill,
} from "@/components/progress/primitives";
import {
  ForecastPill,
  ProjectStatusPill,
} from "@/components/progress/status";
import type { Project } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export type ProjectTabKey =
  | "overview"
  | "journal"
  | "media"
  | "purchases"
  | "settings";

const TABS: Array<{ key: ProjectTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "journal", label: "Journal" },
  { key: "media", label: "Media" },
  { key: "purchases", label: "Purchases" },
  { key: "settings", label: "Settings" },
];

export function projectTabHref(projectId: string, tab: ProjectTabKey) {
  if (tab === "purchases") return `/projects/${projectId}/purchases`;
  if (tab === "overview") return `/projects/${projectId}`;
  return `/projects/${projectId}?tab=${tab}`;
}

export function ProjectChrome({
  project,
  activeTab,
  onTabChange,
  actions,
}: {
  project: Project;
  activeTab: ProjectTabKey;
  /** When provided, local tabs use callbacks (main project page). Otherwise links. */
  onTabChange?: (tab: ProjectTabKey) => void;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <SitePageHeader
        kicker={project.code}
        title={project.name}
        description={project.address}
        action={actions}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        <ProjectStatusPill status={project.status} />
        <ForecastPill status={project.forecastStatus} />
        <SitePill>Forecast {formatDate(project.forecastCompletionDate)}</SitePill>
        <SitePill>Contract {formatDate(project.contractCompletionDate)}</SitePill>
      </div>

      <div className="site-filter-rail">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          if (onTabChange && tab.key !== "purchases") {
            return (
              <button
                key={tab.key}
                type="button"
                className="site-chip"
                data-active={active}
                onClick={() => onTabChange(tab.key)}
              >
                {tab.label}
              </button>
            );
          }
          return (
            <Link
              key={tab.key}
              href={projectTabHref(project.id, tab.key)}
              className="site-chip"
              data-active={active}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}

export function ProjectChromeActions({
  projectId,
  onStages,
}: {
  projectId: string;
  onStages?: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <SiteButton href={`/projects/${projectId}/update`} variant="accent">
        Today’s journal
      </SiteButton>
      {onStages ? (
        <SiteButton type="button" variant="ghost" onClick={onStages}>
          Stages
        </SiteButton>
      ) : (
        <SiteButton href={`/projects/${projectId}`} variant="ghost">
          Stages
        </SiteButton>
      )}
    </div>
  );
}
