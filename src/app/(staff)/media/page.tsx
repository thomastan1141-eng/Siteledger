"use client";

import { useEffect, useState } from "react";
import {
  SiteButton,
  SitePageHeader,
  SiteSelect,
  SiteSpinner,
} from "@/components/progress/primitives";
import { BunnyVideoUploader } from "@/components/media/bunny-video-uploader";
import { ProgressMediaGrid } from "@/components/progress/media-grid";
import { useAuth } from "@/lib/auth-context";
import { fetchMyProjects } from "@/lib/services/projects";
import { listMedia } from "@/lib/services/media";
import type { MediaItem, Project } from "@/lib/types";
import { getProjectDisplayName } from "@/lib/utils";

export default function MediaLibraryPage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const selectedProject = projects.find((p) => p.id === projectId) || null;
  // Always the selected Project's own workspaceId — never the USER's
  // defaultWorkspaceId, which is wrong for a Project shared cross-workspace.
  const projectWorkspaceId =
    selectedProject?.workspaceId || selectedProject?.companyId || "";
  const isCreator = Boolean(
    selectedProject && profile?.uid && selectedProject.createdBy === profile.uid,
  );
  const isClientMember = Boolean(
    selectedProject &&
      profile?.uid &&
      !isCreator &&
      selectedProject.clientUserIds?.includes(profile.uid),
  );

  function reloadMedia() {
    if (!projectId || !projectWorkspaceId) return;
    listMedia(projectId, { workspaceId: projectWorkspaceId }).then(setMedia);
  }

  useEffect(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMyProjects();
        if (cancelled) return;
        setProjects(data);
        if (data[0]) setProjectId(data[0].id);
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

  useEffect(() => {
    if (!projectId || !projectWorkspaceId) return;
    listMedia(projectId, { workspaceId: projectWorkspaceId }).then(setMedia);
  }, [projectId, projectWorkspaceId]);

  const filtered = media.filter((item) => {
    if (filter === "all") return true;
    if (filter === "photo" || filter === "video") return item.type === filter;
    return item.visibility === filter;
  });

  if (loading) return <SiteSpinner />;

  return (
    <div>
      <SitePageHeader
        kicker="Archive"
        title="Media library"
        description="Browse site photos and videos across projects."
        action={
          projectId ? (
            <SiteButton href={`/projects/${projectId}/update`} variant="accent">
              Upload today
            </SiteButton>
          ) : null
        }
      />

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 20,
          maxWidth: 560,
        }}
      >
        <SiteSelect
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {getProjectDisplayName(p)}
            </option>
          ))}
        </SiteSelect>
        <SiteSelect value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="photo">Photos</option>
          <option value="video">Videos</option>
          <option value="client_visible">Client visible</option>
          <option value="internal">Internal</option>
          <option value="handover">Handover</option>
        </SiteSelect>
      </div>

      {projectId && projectWorkspaceId && !isClientMember ? (
        <div style={{ marginBottom: 20 }}>
          <BunnyVideoUploader
            projectId={projectId}
            workspaceId={projectWorkspaceId}
            onUploaded={() => reloadMedia()}
          />
        </div>
      ) : null}

      <ProgressMediaGrid
        items={filtered}
        allowDownload
        workspaceId={projectWorkspaceId}
        canDelete={isCreator}
        onChanged={reloadMedia}
      />

      {!projects.length ? (
        <p style={{ color: "var(--site-text-secondary)" }}>
          No projects yet. Create a project first.
        </p>
      ) : null}
    </div>
  );
}
