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
import {
  formatDate,
  getProjectDisplayTitle,
  getProjectManagerName,
  isProjectIncomplete,
} from "@/lib/utils";

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
  hiddenTabs,
}: {
  project: Project;
  activeTab: ProjectTabKey;
  /** When provided, local tabs use callbacks (main project page). Otherwise links. */
  onTabChange?: (tab: ProjectTabKey) => void;
  actions?: React.ReactNode;
  /** Tabs to omit entirely — e.g. "settings" for a Client-type member. */
  hiddenTabs?: ProjectTabKey[];
}) {
  const visibleTabs = hiddenTabs?.length
    ? TABS.filter((t) => !hiddenTabs.includes(t.key))
    : TABS;
  return (
    <>
      <SitePageHeader
        kicker={project.clientName || "Project"}
        title={getProjectDisplayTitle(project)}
        description={
          getProjectManagerName(project)
            ? `Manager · ${getProjectManagerName(project)}`
            : undefined
        }
        action={actions}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        {isProjectIncomplete(project) ? <SitePill>Draft</SitePill> : null}
        <ProjectStatusPill status={project.status} />
        <ForecastPill status={project.forecastStatus} />
        <SitePill>Forecast {formatDate(project.forecastCompletionDate)}</SitePill>
        <SitePill>Contract {formatDate(project.contractCompletionDate)}</SitePill>
      </div>

      <div className="site-filter-rail">
        {visibleTabs.map((tab) => {
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
  onDelete,
  showJournal = true,
}: {
  projectId: string;
  onStages?: () => void;
  /** When provided, shows a "Delete project" action regardless of active tab. */
  onDelete?: () => void;
  /** Hide Today's journal for Client / VIEWER (read-only members). */
  showJournal?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {showJournal ? (
        <SiteButton href={`/projects/${projectId}/update`} variant="accent">
          Today’s journal
        </SiteButton>
      ) : null}
      {onStages ? (
        <SiteButton type="button" variant="ghost" onClick={onStages}>
          Stages
        </SiteButton>
      ) : null}
      {onDelete ? (
        <SiteButton
          type="button"
          variant="ghost"
          onClick={onDelete}
          style={{ color: "var(--site-danger)" }}
        >
          Delete project
        </SiteButton>
      ) : null}
    </div>
  );
}
