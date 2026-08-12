"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  SiteButton,
  SiteField,
  SiteInput,
  SiteSection,
  SiteSelect,
  SiteSpinner,
  SiteTextarea,
} from "@/components/progress/primitives";
import { SimpleMediaUploader } from "@/components/media/simple-media-uploader";
import {
  ProgressMediaGrid,
  type MediaGridSize,
} from "@/components/progress/media-grid";
import { MediaPaginationBar } from "@/components/progress/media-pagination-bar";
import { ProgressTimeline } from "@/components/progress/timeline";
import { JournalComposer } from "@/components/progress/journal-composer";
import { ManageStagesDialog } from "@/components/progress/manage-stages";
import { MonthWorkCalendar } from "@/components/progress/month-calendar";
import {
  getOverviewDisplayImage,
  Overview3DPanel,
} from "@/components/progress/overview-3d";
import {
  ProjectChrome,
  ProjectChromeActions,
  type ProjectTabKey,
} from "@/components/progress/project-chrome";
import { WeekTimeline } from "@/components/progress/week-timeline";
import { ScheduleStatusPill } from "@/components/progress/status";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { usePageWidth } from "@/lib/page-width";
import { getFirebaseAuth } from "@/lib/firebase";
import { useMediaPage } from "@/lib/hooks/use-media-page";
import {
  fetchProjectResolve,
  markProjectCompleted,
  updateProject,
} from "@/lib/services/projects";
import { listSchedule, summarizeSchedule } from "@/lib/services/schedule";
import {
  groupJournalMediaPage,
  listUpdates,
} from "@/lib/services/updates";
import {
  countMediaPages,
  invalidateMediaPageCache,
  listLatestMedia,
} from "@/lib/services/media-pagination";
import type {
  ColleaguePermissions,
  DailyUpdate,
  ForecastStatus,
  MediaItem,
  Project,
  ProjectStatus,
  ScheduleItem,
} from "@/lib/types";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  getProjectDisplayTitle,
  getProjectManagerName,
} from "@/lib/utils";

const MEDIA_PHOTO_SIZE_KEY = "siteledger.projectMediaPhotoSize";
const MEDIA_VIDEO_SIZE_KEY = "siteledger.projectMediaVideoSize";
const MEDIA_SIZES: MediaGridSize[] = ["small", "medium", "large"];
const MEDIA_SIZE_LABELS: Record<MediaGridSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

function readStoredMediaSize(key: string): MediaGridSize {
  if (typeof window === "undefined") return "small";
  const stored = window.localStorage.getItem(key);
  return stored === "medium" || stored === "large" ? stored : "small";
}

export default function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  // USER-scoped access hints from the server resolver — creator OR ACTIVE
  // membership only. Never derived from users/{uid}.role or workspace admin.
  const [access, setAccess] = useState<{
    isOwner: boolean;
    memberType: string | null;
    permissionPreset: string | null;
    effectivePermissions: ColleaguePermissions | null;
  }>({
    isOwner: false,
    memberType: null,
    permissionPreset: null,
    effectivePermissions: null,
  });
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [overviewMedia, setOverviewMedia] = useState<MediaItem[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [videoCount, setVideoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<ProjectTabKey>(
    initialTab === "journal" ||
      initialTab === "media" ||
      initialTab === "settings"
      ? initialTab
      : "overview",
  );
  const pageFromUrl = (() => {
    const n = Number(searchParams.get("page") || "1");
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.floor(n);
  })();
  // Overview tab embeds the 12-week timeline + monthly calendar, so it gets
  // the "wide" section width; other tabs (journal/media/settings) stay normal.
  usePageWidth(tab === "overview" ? "wide" : "normal");
  const [mediaTab, setMediaTab] = useState<"photos" | "videos" | "all">("all");
  const [photoSize, setPhotoSize] = useState<MediaGridSize>(() =>
    readStoredMediaSize(MEDIA_PHOTO_SIZE_KEY),
  );
  const [videoSize, setVideoSize] = useState<MediaGridSize>(() =>
    readStoredMediaSize(MEDIA_VIDEO_SIZE_KEY),
  );
  useEffect(() => {
    window.localStorage.setItem(MEDIA_PHOTO_SIZE_KEY, photoSize);
  }, [photoSize]);
  useEffect(() => {
    window.localStorage.setItem(MEDIA_VIDEO_SIZE_KEY, videoSize);
  }, [videoSize]);
  const [manageStagesOpen, setManageStagesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [edit, setEdit] = useState({
    clientName: "",
    manager: "",
    address: "",
    forecastCompletionDate: "",
    contractCompletionDate: "",
    status: "in_progress" as ProjectStatus,
    forecastStatus: "on_track" as ForecastStatus,
    internalNotes: "",
    allowStaffPublish: false,
    allowClientDownload: false,
  });

  async function reload() {
    try {
      // Server-resolved: creator OR ACTIVE membership, using the Project's
      // actual workspaceId — never the current USER's defaultWorkspaceId,
      // which is wrong for a Project shared from another workspace.
      const resolved = await fetchProjectResolve(id);
      const p = resolved?.project ?? null;
      const ws = resolved?.workspaceId;
      const memberType = resolved?.memberType ?? null;
      const clientOnly = memberType === "CLIENT";
      setAccess({
        isOwner: Boolean(resolved?.isOwner),
        memberType,
        permissionPreset: resolved?.permissionPreset ?? null,
        effectivePermissions: resolved?.effectivePermissions ?? null,
      });
      // Resolve succeeded → keep the Project even if a subcollection list
      // fails. CLIENT queries MUST use clientOnly so Rules never evaluate
      // internal/non-clientVisible docs (which deny the whole list).
      setProject(p);
      if (p) {
        setEdit({
          clientName: p.clientName || "",
          manager: getProjectManagerName(p),
          address: p.address || "",
          forecastCompletionDate: p.forecastCompletionDate || "",
          contractCompletionDate: p.contractCompletionDate || "",
          status: p.status,
          forecastStatus: p.forecastStatus,
          internalNotes: p.internalNotes || "",
          allowStaffPublish: p.allowStaffPublish,
          allowClientDownload: p.allowClientDownload,
        });
      }
      if (!ws || !p) {
        setSchedule([]);
        setUpdates([]);
        setOverviewMedia([]);
        setPhotoCount(0);
        setVideoCount(0);
        return;
      }
      const clientOnlyReload = memberType === "CLIENT";
      try {
        const [s, u, latest, photos, videos] = await Promise.all([
          listSchedule(id, { workspaceId: ws, clientOnly: clientOnlyReload }),
          listUpdates(id, { workspaceId: ws, clientOnly: clientOnlyReload }),
          listLatestMedia(
            {
              projectId: id,
              workspaceId: ws,
              clientOnly: clientOnlyReload,
            },
            8,
          ),
          countMediaPages({
            projectId: id,
            workspaceId: ws,
            clientOnly: clientOnlyReload,
            type: "photo",
          }),
          countMediaPages({
            projectId: id,
            workspaceId: ws,
            clientOnly: clientOnlyReload,
            type: "video",
          }),
        ]);
        setSchedule(s);
        setUpdates(u);
        setOverviewMedia(latest);
        setPhotoCount(photos.totalCount);
        setVideoCount(videos.totalCount);
      } catch (subErr) {
        console.error("[project subcollection reload]", subErr);
        setSchedule([]);
        setUpdates([]);
        setOverviewMedia([]);
        setPhotoCount(0);
        setVideoCount(0);
      }
    } catch (err) {
      console.error("[project reload]", err);
      setProject(null);
      setSchedule([]);
      setUpdates([]);
      setOverviewMedia([]);
      setPhotoCount(0);
      setVideoCount(0);
    }
  }

  useEffect(() => {
    // Data load for project shell — async setState in .then/.finally
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on id/workspace change
    setLoading(true);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const summary = useMemo(() => summarizeSchedule(schedule), [schedule]);
  const isClientMember = access.memberType === "CLIENT";
  const projectWs = project?.workspaceId || project?.companyId || "";
  const mediaTypeFilter =
    mediaTab === "photos" ? "photo" : mediaTab === "videos" ? "video" : undefined;

  const journalFilters = useMemo(() => {
    if (!project?.id || !projectWs) return null;
    return {
      projectId: project.id,
      workspaceId: projectWs,
      clientOnly: isClientMember,
    };
  }, [project?.id, projectWs, isClientMember]);

  const mediaFilters = useMemo(() => {
    if (!project?.id || !projectWs) return null;
    return {
      projectId: project.id,
      workspaceId: projectWs,
      clientOnly: isClientMember,
      type: mediaTypeFilter as "photo" | "video" | undefined,
    };
  }, [project?.id, projectWs, isClientMember, mediaTypeFilter]);

  const journalPager = useMediaPage({
    enabled: tab === "journal" && Boolean(journalFilters),
    surface: "Journal",
    filters: journalFilters,
    page: pageFromUrl,
    onPageClamp: (resolved) =>
      replaceProjectQuery({ page: resolved <= 1 ? null : resolved }),
  });
  const mediaPager = useMediaPage({
    enabled: tab === "media" && Boolean(mediaFilters),
    surface: "Media",
    filters: mediaFilters,
    page: pageFromUrl,
    onPageClamp: (resolved) =>
      replaceProjectQuery({ page: resolved <= 1 ? null : resolved }),
  });

  const journalPageView = useMemo(
    () => groupJournalMediaPage(journalPager.items, updates),
    [journalPager.items, updates],
  );

  function replaceProjectQuery(patch: {
    tab?: ProjectTabKey;
    page?: number | null;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextTab = patch.tab ?? tab;
    if (nextTab === "overview") params.delete("tab");
    else params.set("tab", nextTab);
    if (patch.page === null || patch.page === undefined || patch.page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(patch.page));
    }
    const qs = params.toString();
    router.replace(qs ? `/projects/${id}?${qs}` : `/projects/${id}`, {
      scroll: false,
    });
  }

  function changeTab(next: ProjectTabKey) {
    if (next === "purchases") {
      router.push(`/projects/${id}/purchases`);
      return;
    }
    setTab(next);
    replaceProjectQuery({ tab: next, page: null });
  }

  function onMediaMutated() {
    invalidateMediaPageCache(id);
    void reload();
    if (tab === "journal") void journalPager.reload({ bypassCache: true });
    if (tab === "media") void mediaPager.reload({ bypassCache: true });
  }

  // Keep local tab in sync when URL changes (back/forward).
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "journal" || t === "media" || t === "settings") setTab(t);
    else if (!t) setTab("overview");
  }, [searchParams]);

  // Only the creator (or a colleague whose effectivePermissions grant
  // editProjectDetails — i.e. the EDITOR preset) may edit Project settings.
  // Never a global users/{uid}.role check.
  const canEditSettings =
    access.isOwner || access.effectivePermissions?.editProjectDetails === true;

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!project || !canEditSettings) return;
    setSaving(true);
    try {
      setProject(
        await updateProject(
          project.id,
          {
            ...edit,
            clientName: edit.clientName.trim(),
            manager: edit.manager.trim(),
            address: edit.address.trim(),
          },
          project.workspaceId,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  // Capability flags from resolved Project membership — never users.role.
  const canEditSchedule =
    access.isOwner || access.effectivePermissions?.updateSchedule === true;
  const canAddJournal =
    access.isOwner || access.effectivePermissions?.addJournal === true;
  const canUploadMedia =
    access.isOwner || access.effectivePermissions?.uploadMedia === true;
  // canEditSettings already defined above from editProjectDetails.

  // Client boundary: Settings holds internal-only content. Purchases are
  // visible to Clients (read-only, no private Cost).
  useEffect(() => {
    if (isClientMember && tab === "settings") setTab("overview");
  }, [isClientMember, tab]);

  if (loading) return <SiteSpinner />;
  if (!project) {
    return <p style={{ color: "var(--site-text-secondary)" }}>Project not found.</p>;
  }

  // Only the creator may delete the entire Project — never a global role.
  const canDeleteProject = access.isOwner;
  // Broad "delete any Media item" — Owner or Editor colleague only. Other
  // colleagues may still delete their own uploads (enforced server-side).
  const canDeleteAllMedia =
    access.isOwner || access.effectivePermissions?.deleteAllMedia === true;
  const canManageMediaVisibility =
    access.isOwner ||
    (!isClientMember &&
      project.allowStaffPublish &&
      access.effectivePermissions?.publishMediaToClient === true);
  const clientHiddenTabs: ProjectTabKey[] = isClientMember ? ["settings"] : [];

  return (
    <div>
      <ProjectChrome
        project={project}
        activeTab={tab}
        hiddenTabs={clientHiddenTabs.length ? clientHiddenTabs : undefined}
        tabLabels={isClientMember ? { journal: "Journey" } : undefined}
        onTabChange={changeTab}
        actions={
          <ProjectChromeActions
            projectId={project.id}
            showJournal={canAddJournal}
            onStages={
              canEditSchedule ? () => setManageStagesOpen(true) : undefined
            }
            onDelete={
              canDeleteProject
                ? () => {
                    setDeleteOpen(true);
                    setDeleteConfirm("");
                    setDeletePassword("");
                    setDeleteError("");
                  }
                : undefined
            }
          />
        }
      />

      {tab === "overview" ? (
        <>
          {/* 2. Hero + 3. Summary */}
          <div className="site-hero-panel">
            <div className="site-hero-visual">
              {getOverviewDisplayImage(project) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getOverviewDisplayImage(project) || undefined}
                  alt={getProjectDisplayTitle(project)}
                />
              ) : null}
              <div className="site-hero-visual-copy">
                <h2>{project.clientName}</h2>
                <p style={{ margin: "8px 0 0", opacity: 0.85 }}>
                  Last update {formatDateTime(project.lastUpdateAt)}
                </p>
              </div>
            </div>
            <div className="site-stat-rail">
              <div className="site-stat">
                <span>Current work</span>
                <strong style={{ fontSize: 16 }}>
                  {summary.ongoing.map((i) => i.name).join(", ") || "—"}
                </strong>
              </div>
              <div className="site-stat">
                <span>Completed stages</span>
                <strong>{summary.completed.length}</strong>
              </div>
              <div className="site-stat">
                <span>Next</span>
                <strong style={{ fontSize: 16 }}>
                  {summary.next?.name || "All planned stages completed"}
                </strong>
              </div>
              <div className="site-stat">
                <span>Storage</span>
                <strong style={{ fontSize: 16 }}>
                  {formatBytes(project.storageBytes)} · {project.photoCount}p /{" "}
                  {project.videoCount}v
                </strong>
              </div>
            </div>
          </div>

          {/* 3D view */}
          <Overview3DPanel
            project={project}
            editable={canEditSettings}
            onUpdated={setProject}
          />

          {/* 4. Project schedule — Timeline then Monthly calendar */}
          <div className="site-schedule-dates">
            <SiteField label="Project commence date">
              <SiteInput
                type="date"
                value={project.startDate || ""}
                disabled={!canEditSettings}
                onChange={async (e) => {
                  if (!canEditSettings) return;
                  const startDate = e.target.value;
                  setProject(
                    await updateProject(
                      project.id,
                      { startDate },
                      project.workspaceId,
                    ),
                  );
                }}
              />
            </SiteField>
            <SiteField label="Target handover date">
              <SiteInput
                type="date"
                value={project.contractCompletionDate || ""}
                disabled={!canEditSettings}
                onChange={async (e) => {
                  if (!canEditSettings) return;
                  const contractCompletionDate = e.target.value;
                  setProject(
                    await updateProject(
                      project.id,
                      {
                        contractCompletionDate,
                        forecastCompletionDate:
                          project.forecastCompletionDate ||
                          contractCompletionDate,
                      },
                      project.workspaceId,
                    ),
                  );
                }}
              />
            </SiteField>
          </div>

          <SiteSection
            title="Project schedule"
            description="12-week stage plan and the monthly work calendar for this site."
          >
            <WeekTimeline
              project={project}
              stages={summary.ordered}
              editable={canEditSchedule}
              onChanged={setSchedule}
            />
            <div style={{ marginTop: 28 }}>
              <h3 className="site-section-title">Monthly work calendar</h3>
              <p className="site-section-desc">
                Asia/Singapore dates. One work item by default; add up to four.
                Does not change stage status or timeline dates.
              </p>
              <MonthWorkCalendar
                projectId={project.id}
                workspaceId={project.workspaceId}
                stages={summary.ordered}
                editable={canEditSchedule}
                clientVisibleOnly={isClientMember}
              />
            </div>
          </SiteSection>

          {/* 5. Stage snapshot */}
          <SiteSection
            title="Stage snapshot"
            description="Only stages chosen for this project."
            action={
              canEditSchedule ? (
                <SiteButton
                  type="button"
                  variant="ghost"
                  onClick={() => setManageStagesOpen(true)}
                >
                  Manage stages
                </SiteButton>
              ) : undefined
            }
          >
            {!schedule.length ? (
              <div className="site-empty">
                <strong>No stages added yet</strong>
                {canEditSchedule ? (
                  <>
                    <p style={{ marginTop: 8 }}>
                      Choose common stages or add custom ones for this project.
                    </p>
                    <div style={{ marginTop: 14 }}>
                      <SiteButton
                        type="button"
                        variant="accent"
                        onClick={() => setManageStagesOpen(true)}
                      >
                        Add project stages
                      </SiteButton>
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {summary.ordered.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.2fr auto auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "7px 0",
                      borderBottom: "1px solid var(--site-border)",
                    }}
                  >
                    <span>{item.name}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--site-text-secondary)",
                      }}
                    >
                      {item.plannedStartDate || item.plannedEndDate
                        ? `${formatDate(item.plannedStartDate)} → ${formatDate(item.plannedEndDate)}`
                        : "—"}
                      {item.actualEndDate
                        ? ` · Done ${formatDate(item.actualEndDate)}`
                        : ""}
                    </span>
                    <ScheduleStatusPill status={item.status} />
                  </li>
                ))}
              </ul>
            )}
          </SiteSection>

          {/* 6. Latest journal / media */}
          <SiteSection
            title="Latest journal"
            description="Most recent site updates and media."
            action={
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => changeTab("journal")}
              >
                Open journal
              </SiteButton>
            }
          >
            <ProgressMediaGrid
              items={overviewMedia}
              allowDownload
              workspaceId={project.workspaceId}
              canDelete={canDeleteAllMedia}
              canManageVisibility={canManageMediaVisibility}
              onChanged={onMediaMutated}
            />
          </SiteSection>

        </>
      ) : null}

      {tab === "journal" ? (
        <>
          {canAddJournal ? (
            <JournalComposer
              project={project}
              compact
              canPublishToClient={canManageMediaVisibility}
              onPublished={async () => {
                onMediaMutated();
              }}
            />
          ) : null}
          {journalPager.loading && !journalPager.items.length ? (
            <SiteSpinner />
          ) : null}
          {journalPager.error ? (
            <p style={{ color: "var(--site-text-secondary)" }}>
              {journalPager.error}
            </p>
          ) : null}
          {!journalPager.loading || journalPager.items.length ? (
            <ProgressTimeline
              groups={journalPageView.groups}
              mediaByUpdate={{}}
              mediaByDate={journalPageView.mediaByDate}
              allowDownload
              workspaceId={project.workspaceId}
              canDelete={canDeleteAllMedia}
              canManageVisibility={canManageMediaVisibility}
              onMediaChanged={onMediaMutated}
              emptyTitle={
                isClientMember ? "Journey is empty" : "Journal is empty"
              }
              emptyDescription={
                isClientMember
                  ? "Client-visible photos and site updates will appear here by day."
                  : "Site updates and media will form the project story here."
              }
            />
          ) : null}
          <MediaPaginationBar
            page={pageFromUrl}
            totalPages={journalPager.totalPages}
            totalCount={journalPager.totalCount}
            busy={journalPager.loading}
            onPageChange={(next) =>
              replaceProjectQuery({ page: next <= 1 ? null : next })
            }
          />
        </>
      ) : null}

      {tab === "media" ? (
        <div style={{ display: "grid", gap: 16 }}>
          {canUploadMedia && project.workspaceId ? (
            <SimpleMediaUploader
              projectId={project.id}
              workspaceId={project.workspaceId}
              onUploaded={onMediaMutated}
            />
          ) : null}

          <div className="site-filter-rail" role="tablist" aria-label="Media type">
            <button
              type="button"
              className="site-chip"
              data-active={mediaTab === "all"}
              onClick={() => {
                setMediaTab("all");
                replaceProjectQuery({ page: null });
              }}
            >
              All ({photoCount + videoCount})
            </button>
            <button
              type="button"
              className="site-chip"
              data-active={mediaTab === "photos"}
              onClick={() => {
                setMediaTab("photos");
                replaceProjectQuery({ page: null });
              }}
            >
              Photos ({photoCount})
            </button>
            <button
              type="button"
              className="site-chip"
              data-active={mediaTab === "videos"}
              onClick={() => {
                setMediaTab("videos");
                replaceProjectQuery({ page: null });
              }}
            >
              Videos ({videoCount})
            </button>
          </div>

          <div
            className="site-timeline-size-toggle"
            role="group"
            aria-label="Thumbnail size"
          >
            <span className="site-timeline-size-label">Size</span>
            {MEDIA_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className="site-chip"
                data-active={
                  (mediaTab === "videos" ? videoSize : photoSize) === s
                }
                onClick={() =>
                  mediaTab === "videos" ? setVideoSize(s) : setPhotoSize(s)
                }
              >
                {MEDIA_SIZE_LABELS[s]}
              </button>
            ))}
          </div>

          {mediaPager.loading && !mediaPager.items.length ? (
            <SiteSpinner />
          ) : null}
          {mediaPager.error ? (
            <p style={{ color: "var(--site-text-secondary)" }}>
              {mediaPager.error}
            </p>
          ) : null}

          <ProgressMediaGrid
            items={mediaPager.items}
            allowDownload
            workspaceId={project.workspaceId}
            canDelete={canDeleteAllMedia}
            canManageVisibility={canManageMediaVisibility}
            onChanged={onMediaMutated}
            size={mediaTab === "videos" ? videoSize : photoSize}
          />

          <MediaPaginationBar
            page={pageFromUrl}
            totalPages={mediaPager.totalPages}
            totalCount={mediaPager.totalCount}
            busy={mediaPager.loading}
            onPageChange={(next) =>
              replaceProjectQuery({ page: next <= 1 ? null : next })
            }
          />
        </div>
      ) : null}

      {canEditSchedule ? (
        <ManageStagesDialog
          projectId={project.id}
          workspaceId={project.workspaceId}
          open={manageStagesOpen}
          onClose={() => setManageStagesOpen(false)}
          onChanged={setSchedule}
        />
      ) : null}

      {tab === "settings" ? (
        <form onSubmit={saveSettings} style={{ maxWidth: 640 }}>
          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <SiteField label="Client name">
              <SiteInput
                value={edit.clientName}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, clientName: e.target.value }))
                }
                disabled={!canEditSettings}
              />
            </SiteField>
            <SiteField label="Manager">
              <SiteInput
                value={edit.manager}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, manager: e.target.value }))
                }
                placeholder="Enter manager name"
                disabled={!canEditSettings}
              />
            </SiteField>
            <div style={{ gridColumn: "1 / -1" }}>
              <SiteField label="Address">
                <SiteInput
                  value={edit.address}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, address: e.target.value }))
                  }
                  disabled={!canEditSettings}
                />
              </SiteField>
            </div>
            <SiteField label="Contract completion">
              <SiteInput
                type="date"
                value={edit.contractCompletionDate}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    contractCompletionDate: e.target.value,
                  }))
                }
                disabled={!canEditSettings}
              />
            </SiteField>
            <SiteField label="Current forecast">
              <SiteInput
                type="date"
                value={edit.forecastCompletionDate}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    forecastCompletionDate: e.target.value,
                  }))
                }
              />
            </SiteField>
            <SiteField label="Project status">
              <SiteSelect
                value={edit.status}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    status: e.target.value as ProjectStatus,
                  }))
                }
              >
                <option value="upcoming">Upcoming</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </SiteSelect>
            </SiteField>
            <SiteField label="Forecast status">
              <SiteSelect
                value={edit.forecastStatus}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    forecastStatus: e.target.value as ForecastStatus,
                  }))
                }
              >
                <option value="on_track">On track</option>
                <option value="slight_delay">Slight delay</option>
                <option value="delayed">Delayed</option>
                <option value="ahead">Ahead of schedule</option>
              </SiteSelect>
            </SiteField>
          </div>

          <div style={{ marginTop: 14 }}>
            <SiteField label="Internal notes">
              <SiteTextarea
                rows={3}
                value={edit.internalNotes}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, internalNotes: e.target.value }))
                }
              />
            </SiteField>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <label style={{ display: "flex", gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={edit.allowStaffPublish}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, allowStaffPublish: e.target.checked }))
                }
              />
              Staff may publish client-visible content
            </label>
            <label style={{ display: "flex", gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={edit.allowClientDownload}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    allowClientDownload: e.target.checked,
                  }))
                }
              />
              Allow clients to download media
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <SiteButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </SiteButton>
            {canEditSettings && project.status !== "completed" ? (
              <SiteButton
                type="button"
                variant="ghost"
                onClick={async () => {
                  setProject(
                    await markProjectCompleted(project.id, project.workspaceId),
                  );
                }}
              >
                Mark completed
              </SiteButton>
            ) : null}
          </div>
        </form>
      ) : null}

      {deleteOpen ? (
        <div className="site-sheet-backdrop">
          <div
            className="site-sheet"
            style={{ maxWidth: 480, padding: 20 }}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="site-section-title">Delete project</h3>
            <p className="site-section-desc">
              The project will move to Recently Deleted for 30 days. Clients and
              colleagues lose access immediately. You can restore it within 30
              days. After that it is permanently removed.
            </p>
            <SiteField
              label={
                getProjectDisplayTitle(project).trim()
                  ? `Type “${getProjectDisplayTitle(project)}” to confirm`
                  : 'Type “DELETE PROJECT” to confirm'
              }
            >
              <SiteInput
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoComplete="off"
              />
            </SiteField>
            <SiteField label="Current password">
              <SiteInput
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </SiteField>
            {deleteError ? (
              <p style={{ color: "var(--site-danger)" }}>{deleteError}</p>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <SiteButton
                type="button"
                variant="accent"
                disabled={deleteBusy}
                onClick={async () => {
                  const expected =
                    getProjectDisplayTitle(project).trim() || "DELETE PROJECT";
                  if (deleteConfirm.trim() !== expected) {
                    setDeleteError(
                      expected === "DELETE PROJECT"
                        ? 'Type "DELETE PROJECT" exactly.'
                        : "Type the exact project address.",
                    );
                    return;
                  }
                  setDeleteBusy(true);
                  setDeleteError("");
                  try {
                    const auth = getFirebaseAuth();
                    const current = auth.currentUser;
                    if (!current?.email) {
                      throw new Error("Please sign in again.");
                    }
                    await reauthenticateWithCredential(
                      current,
                      EmailAuthProvider.credential(
                        current.email,
                        deletePassword,
                      ),
                    );
                    const token = await current.getIdToken(true);
                    const ws = project.workspaceId;
                    const res = await fetch(
                      `/api/projects/${project.id}/trash`,
                      {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${token}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          workspaceId: ws,
                          confirmTitle: deleteConfirm.trim(),
                        }),
                      },
                    );
                    const data = (await res.json()) as { error?: string };
                    if (!res.ok) {
                      throw new Error(data.error || "Delete failed.");
                    }
                    router.push("/projects/trash");
                  } catch (err) {
                    setDeleteError(
                      err instanceof Error ? err.message : "Delete failed.",
                    );
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {deleteBusy ? "Deleting…" : "Move to Recently Deleted"}
              </SiteButton>
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </SiteButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
