"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SitePageHeader,
  SiteSpinner,
} from "@/components/progress/primitives";
import { useAuth } from "@/lib/auth-context";
import { listProjects } from "@/lib/services/projects";
import type { Project } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

export default function StoragePage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects().then((data) => {
      setProjects(data);
      setLoading(false);
    });
  }, []);

  const totals = useMemo(() => {
    return projects.reduce(
      (acc, p) => {
        acc.bytes += p.storageBytes || 0;
        acc.photos += p.photoCount || 0;
        acc.videos += p.videoCount || 0;
        return acc;
      },
      { bytes: 0, photos: 0, videos: 0 },
    );
  }, [projects]);

  if (profile?.role !== "admin") {
    return (
      <p style={{ color: "var(--site-text-secondary)" }}>
        Only administrators can view storage usage.
      </p>
    );
  }

  if (loading) return <SiteSpinner />;

  const ranked = [...projects].sort(
    (a, b) => (b.storageBytes || 0) - (a.storageBytes || 0),
  );

  return (
    <div>
      <SitePageHeader
        kicker="Capacity"
        title="Storage"
        description="How much each site journal is using in Firebase Storage."
      />

      <div className="site-stat-rail" style={{ marginBottom: 28 }}>
        <div className="site-stat">
          <span>Company total</span>
          <strong>{formatBytes(totals.bytes)}</strong>
        </div>
        <div className="site-stat">
          <span>Photos</span>
          <strong>{totals.photos}</strong>
        </div>
        <div className="site-stat">
          <span>Videos</span>
          <strong>{totals.videos}</strong>
        </div>
      </div>

      {ranked.map((project) => (
        <div
          key={project.id}
          className="site-project-strip"
          style={{ cursor: "default" }}
        >
          <div className="site-project-thumb" />
          <div className="site-project-meta">
            <h3>{project.name}</h3>
            <p>
              {project.photoCount} photos · {project.videoCount} videos
            </p>
          </div>
          <div className="site-project-side">
            <strong>{formatBytes(project.storageBytes || 0)}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
