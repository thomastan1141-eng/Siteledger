"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SiteButton,
  SitePageHeader,
  SiteSection,
  SiteSpinner,
} from "@/components/progress/primitives";
import { ForecastPill, ProjectStatusPill } from "@/components/progress/status";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { listProjectsAcrossWorkspaces, workspaceIdsForProfile } from "@/lib/services/projects";
import { buildDashboardAlerts } from "@/lib/services/reminders";
import type { Project } from "@/lib/types";
import {
  formatDate,
  formatDateTime,
  getProjectDisplayTitle,
} from "@/lib/utils";

export default function DashboardPage() {
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [alerts, setAlerts] = useState<
    Awaited<ReturnType<typeof buildDashboardAlerts>>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const ids = workspaceIdsForProfile({
        defaultWorkspaceId:
          workspaceId ||
          profile?.defaultWorkspaceId ||
          profile?.companyId ||
          "",
        companyId: profile?.companyId,
        sharedWorkspaceIds: profile?.sharedWorkspaceIds,
      });
      if (!ids.length) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const all = await listProjectsAcrossWorkspaces({
          workspaceIds: ids,
          ...(profile?.role === "staff" ? { staffId: profile.uid } : {}),
        });
        setProjects(all);
        setAlerts(await buildDashboardAlerts(all));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile, workspaceId]);

  if (loading) return <SiteSpinner />;

  const active = projects.filter((p) => p.status === "in_progress");
  const recent = [...projects]
    .filter((p) => p.lastUpdateAt)
    .sort((a, b) => (b.lastUpdateAt || "").localeCompare(a.lastUpdateAt || ""))
    .slice(0, 5);

  return (
    <div>
      <SitePageHeader
        kicker="Workspace"
        title="Today on site"
        description="Projects that need attention, then the latest photos from the field."
        action={
          <SiteButton href="/projects/new" variant="accent">
            New project
          </SiteButton>
        }
      />

      <div className="site-hero-panel">
        <div className="site-hero-visual">
          <div className="site-hero-visual-copy">
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                opacity: 0.75,
              }}
            >
              Active sites
            </p>
            <h2>{active.length} in progress</h2>
            <p style={{ margin: "10px 0 0", opacity: 0.85, maxWidth: "36ch" }}>
              Capture today’s work, photos and videos before leaving site.
            </p>
          </div>
        </div>
        <div className="site-stat-rail">
          <div className="site-stat">
            <span>Needs update</span>
            <strong>
              {alerts.filter((a) => a.type === "missing_today").length}
            </strong>
          </div>
          <div className="site-stat">
            <span>Schedule watch</span>
            <strong>
              {
                alerts.filter(
                  (a) => a.type === "delayed" || a.type === "completion_soon",
                ).length
              }
            </strong>
          </div>
          <div className="site-stat">
            <span>Latest upload</span>
            <strong style={{ fontSize: 16 }}>
              {recent[0]
                ? formatDateTime(recent[0].lastUpdateAt)
                : "No uploads yet"}
            </strong>
          </div>
        </div>
      </div>

      <SiteSection
        title="Attention"
        description="Missing daily journals and forecast reminders."
      >
        {!alerts.length ? (
          <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
            All clear for today.
          </p>
        ) : (
          <div className="site-alert-list">
            {alerts.map((alert, i) => (
              <Link
                key={`${alert.projectId}-${alert.type}-${i}`}
                href={`/projects/${alert.projectId}`}
                className="site-alert"
              >
                <span className="site-alert-dot" />
                <div>
                  <h4>{alert.projectName}</h4>
                  <p>{alert.message}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SiteSection>

      <SiteSection
        title="Projects"
        description="Open a site to publish today’s journal."
        action={
          <SiteButton href="/projects" variant="ghost">
            View all
          </SiteButton>
        }
      >
        {active.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="site-project-strip"
          >
            <div className="site-project-thumb">
              {project.coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.coverPhotoUrl} alt="" />
              ) : null}
            </div>
            <div className="site-project-meta">
              <h3>{getProjectDisplayTitle(project)}</h3>
              <p>
                {project.clientName}
                <br />
                Forecast {formatDate(project.forecastCompletionDate)}
              </p>
            </div>
            <div className="site-project-side">
              <ProjectStatusPill status={project.status} />
              <ForecastPill status={project.forecastStatus} />
            </div>
          </Link>
        ))}
        {!active.length ? (
          <p style={{ color: "var(--site-text-secondary)", fontSize: 14 }}>
            No active projects yet.
          </p>
        ) : null}
      </SiteSection>
    </div>
  );
}
