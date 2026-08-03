"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SiteButton,
  SitePageHeader,
  SiteSpinner,
} from "@/components/progress/primitives";
import { ForecastPill, ProjectStatusPill } from "@/components/progress/status";
import { useAuth } from "@/lib/auth-context";
import { listProjects } from "@/lib/services/projects";
import type { Project } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function ProjectsPage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects(
      profile?.role === "staff" ? { staffId: profile.uid } : undefined,
    )
      .then(setProjects)
      .finally(() => setLoading(false));
  }, [profile]);

  if (loading) return <SiteSpinner />;

  return (
    <div>
      <SitePageHeader
        kicker="Sites"
        title="Projects"
        description="Every renovation site as a living progress journal."
        action={
          profile?.role === "admin" ? (
            <SiteButton href="/projects/new" variant="accent">
              New project
            </SiteButton>
          ) : null
        }
      />

      {projects.map((project) => (
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
            <h3>{project.name}</h3>
            <p>
              {project.clientName} · {project.code}
              <br />
              {project.address}
            </p>
          </div>
          <div className="site-project-side">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <ProjectStatusPill status={project.status} />
              <ForecastPill status={project.forecastStatus} />
            </div>
            <span style={{ fontSize: 12, color: "var(--site-text-light)" }}>
              Due {formatDate(project.forecastCompletionDate)}
            </span>
          </div>
        </Link>
      ))}

      {!projects.length ? (
        <p style={{ color: "var(--site-text-secondary)" }}>
          No projects yet. Create the first site journal.
        </p>
      ) : null}
    </div>
  );
}
