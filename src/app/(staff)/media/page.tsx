"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SiteButton,
  SitePageHeader,
  SiteSelect,
  SiteSpinner,
} from "@/components/progress/primitives";
import { BunnyVideoUploader } from "@/components/media/bunny-video-uploader";
import { ProgressMediaGrid } from "@/components/progress/media-grid";
import { MediaPaginationBar } from "@/components/progress/media-pagination-bar";
import { useAuth } from "@/lib/auth-context";
import { useMediaPage } from "@/lib/hooks/use-media-page";
import { fetchMyProjects, type MyProject } from "@/lib/services/projects";
import type { MediaType, MediaVisibility } from "@/lib/types";
import { getProjectDisplayName } from "@/lib/utils";

function parsePage(raw: string | null) {
  const n = Number(raw || "1");
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export default function MediaLibraryPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(true);

  const projectId = searchParams.get("projectId") || "";
  const page = parsePage(searchParams.get("page"));
  const filter = searchParams.get("filter") || "all";

  const selectedProject = projects.find((p) => p.id === projectId) || null;
  const projectWorkspaceId =
    selectedProject?.workspaceId || selectedProject?.companyId || "";
  const isCreator = Boolean(
    selectedProject && profile?.uid && selectedProject.createdBy === profile.uid,
  );
  const isClientMember = selectedProject?.memberType === "CLIENT";
  const canManageMediaVisibility =
    Boolean(selectedProject?.isOwner) ||
    (!isClientMember &&
      Boolean(selectedProject?.allowStaffPublish) &&
      selectedProject?.effectivePermissions?.publishMediaToClient === true);

  const typeFilter: MediaType | undefined =
    filter === "photo" || filter === "video" ? filter : undefined;
  const visibilityFilter: MediaVisibility | undefined =
    filter === "client_visible" ||
    filter === "internal" ||
    filter === "handover"
      ? filter
      : undefined;

  const filters = useMemo(() => {
    if (!projectId || !projectWorkspaceId) return null;
    return {
      projectId,
      workspaceId: projectWorkspaceId,
      clientOnly: isClientMember,
      type: typeFilter,
      visibility: isClientMember ? undefined : visibilityFilter,
    };
  }, [
    projectId,
    projectWorkspaceId,
    isClientMember,
    typeFilter,
    visibilityFilter,
  ]);

  const pager = useMediaPage({
    enabled: Boolean(filters),
    surface: "Media",
    filters,
    page,
    onPageClamp: (resolved) =>
      replaceParams({ page: resolved <= 1 ? null : String(resolved) }),
  });

  function replaceParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `/media?${qs}` : "/media", { scroll: false });
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
        if (!projectId && data[0]) {
          replaceParams({ projectId: data[0].id, page: null });
        }
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  // Clear stale grid immediately when switching projects.
  useEffect(() => {
    // project change is handled by useMediaPage; ensure URL page resets when project changes via select
  }, [projectId]);

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
          onChange={(e) =>
            replaceParams({
              projectId: e.target.value || null,
              page: null,
            })
          }
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {getProjectDisplayName(p)}
            </option>
          ))}
        </SiteSelect>
        <SiteSelect
          value={filter}
          onChange={(e) =>
            replaceParams({
              filter: e.target.value === "all" ? null : e.target.value,
              page: null,
            })
          }
        >
          <option value="all">All</option>
          <option value="photo">Photos</option>
          <option value="video">Videos</option>
          {!isClientMember ? (
            <>
              <option value="client_visible">Client visible</option>
              <option value="internal">Internal</option>
              <option value="handover">Handover</option>
            </>
          ) : null}
        </SiteSelect>
      </div>

      {projectId && projectWorkspaceId && !isClientMember ? (
        <div style={{ marginBottom: 20 }}>
          <BunnyVideoUploader
            projectId={projectId}
            workspaceId={projectWorkspaceId}
            onUploaded={() => void pager.reload({ bypassCache: true })}
          />
        </div>
      ) : null}

      {pager.loading && !pager.items.length ? <SiteSpinner /> : null}
      {pager.error ? (
        <p style={{ color: "var(--site-text-secondary)" }}>{pager.error}</p>
      ) : null}

      <ProgressMediaGrid
        items={pager.items}
        allowDownload
        workspaceId={projectWorkspaceId}
        canDelete={isCreator}
        canManageVisibility={canManageMediaVisibility}
        onChanged={() => void pager.reload({ bypassCache: true })}
      />

      <MediaPaginationBar
        page={page}
        totalPages={pager.totalPages}
        totalCount={pager.totalCount}
        busy={pager.loading}
        onPageChange={(next) =>
          replaceParams({ page: next <= 1 ? null : String(next) })
        }
      />

      {!projects.length ? (
        <p style={{ color: "var(--site-text-secondary)" }}>
          No projects yet. Create a project first.
        </p>
      ) : null}
    </div>
  );
}
