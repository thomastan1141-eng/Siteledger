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
import { useWorkspace } from "@/lib/workspace-context";
import { listProjects } from "@/lib/services/projects";
import { listMedia } from "@/lib/services/media";
import type { MediaItem, Project } from "@/lib/types";
import { getProjectDisplayName } from "@/lib/utils";

export default function MediaLibraryPage() {
  const { profile } = useAuth();
  const { workspaceId } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const ws = workspaceId || profile?.defaultWorkspaceId || profile?.companyId || "";

  function reloadMedia() {
    if (!projectId || !ws) return;
    listMedia(projectId, { workspaceId: ws }).then(setMedia);
  }

  useEffect(() => {
    if (!ws) {
      setLoading(false);
      return;
    }
    listProjects({
      workspaceId: ws,
      ...(profile?.role === "staff" ? { staffId: profile.uid } : {}),
    }).then((data) => {
      setProjects(data);
      if (data[0]) setProjectId(data[0].id);
      setLoading(false);
    });
  }, [profile, ws]);

  useEffect(() => {
    if (!projectId || !ws) return;
    listMedia(projectId, { workspaceId: ws }).then(setMedia);
  }, [projectId, ws]);

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

      {projectId && ws && profile?.role !== "client" ? (
        <div style={{ marginBottom: 20 }}>
          <BunnyVideoUploader
            projectId={projectId}
            workspaceId={ws}
            onUploaded={() => reloadMedia()}
          />
        </div>
      ) : null}

      <ProgressMediaGrid
        items={filtered}
        allowDownload
        workspaceId={ws}
        canDelete={profile?.role === "admin"}
        onChanged={reloadMedia}
      />
    </div>
  );
}
