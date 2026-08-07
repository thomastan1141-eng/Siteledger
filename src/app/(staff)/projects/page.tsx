"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SiteButton,
  SiteInput,
  SitePageHeader,
  SitePill,
  SiteSpinner,
} from "@/components/progress/primitives";
import { ForecastPill, ProjectStatusPill } from "@/components/progress/status";
import { useAuth } from "@/lib/auth-context";
import { fetchMyProjects, type MyProject } from "@/lib/services/projects";
import { countSharedUsers } from "@/lib/services/invites";
import {
  formatDate,
  getProjectDisplayTitle,
  getProjectManagerName,
  isProjectIncomplete,
  matchesProjectSearch,
} from "@/lib/utils";

export default function ProjectsPage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no account yet
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMyProjects();
        if (!cancelled) setProjects(data);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.uid]);

  if (loading) return <SiteSpinner />;

  const visible = projects.filter((p) => matchesProjectSearch(p, query));

  return (
    <div>
      <SitePageHeader
        kicker="Sites"
        title="Projects"
        description="Every renovation site as a living progress journal."
        action={
          profile?.uid ? (
            <SiteButton href="/projects/new" variant="accent">
              New project
            </SiteButton>
          ) : null
        }
      />

      <div style={{ maxWidth: 420, marginBottom: 18 }}>
        <SiteInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address, client, or manager"
          aria-label="Search projects"
        />
      </div>

      {visible.map((project) => {
        // Shared indicator is only meaningful for Projects the USER created.
        const sharedCount = project.isOwner
          ? (project.sharedActiveCount ?? countSharedUsers(project))
          : 0;
        return (
          <div key={project.id} className="site-project-strip">
            <Link
              href={`/projects/${project.id}`}
              className="site-project-thumb"
              style={{ display: "block" }}
            >
              {project.coverPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.coverPhotoUrl} alt="" />
              ) : null}
            </Link>
            <Link
              href={`/projects/${project.id}`}
              className="site-project-meta"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <h3>{getProjectDisplayTitle(project)}</h3>
              <p>
                {project.clientName || "No client yet"}
                {getProjectManagerName(project)
                  ? ` · ${getProjectManagerName(project)}`
                  : ""}
              </p>
            </Link>
            <div className="site-project-side">
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {isProjectIncomplete(project) ? <SitePill>Draft</SitePill> : null}
                {sharedCount > 0 ? (
                  <Link
                    href={`/access?projectId=${encodeURIComponent(project.id)}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ textDecoration: "none" }}
                  >
                    <SitePill>
                      Shared · {sharedCount}
                    </SitePill>
                  </Link>
                ) : null}
                <ProjectStatusPill status={project.status} />
                <ForecastPill status={project.forecastStatus} />
              </div>
              <span style={{ fontSize: 12, color: "var(--site-text-light)" }}>
                Due {formatDate(project.forecastCompletionDate)}
              </span>
            </div>
          </div>
        );
      })}

      {!projects.length ? (
        <p style={{ color: "var(--site-text-secondary)" }}>
          No projects yet. Create the first site journal.
        </p>
      ) : null}
      {projects.length && !visible.length ? (
        <p style={{ color: "var(--site-text-secondary)" }}>
          No projects match this search.
        </p>
      ) : null}
    </div>
  );
}
