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
import { ProgressMediaGrid } from "@/components/progress/media-grid";
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
import { useAuth } from "@/lib/auth-context";
import {
  getProject,
  markProjectCompleted,
  updateProject,
} from "@/lib/services/projects";
import { listSchedule, summarizeSchedule } from "@/lib/services/schedule";
import { groupUpdatesByDate, listUpdates } from "@/lib/services/updates";
import { listMedia } from "@/lib/services/media";
import type {
  DailyUpdate,
  ForecastStatus,
  MediaItem,
  Project,
  ProjectStatus,
  ScheduleItem,
} from "@/lib/types";
import { formatBytes, formatDate, formatDateTime } from "@/lib/utils";

export default function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
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
  const [manageStagesOpen, setManageStagesOpen] = useState(false);
  const [edit, setEdit] = useState({
    forecastCompletionDate: "",
    contractCompletionDate: "",
    status: "in_progress" as ProjectStatus,
    forecastStatus: "on_track" as ForecastStatus,
    internalNotes: "",
    allowStaffPublish: false,
    allowClientDownload: false,
  });

  async function reload() {
    const [p, s, u, m] = await Promise.all([
      getProject(id),
      listSchedule(id),
      listUpdates(id),
      listMedia(id),
    ]);
    setProject(p);
    setSchedule(s);
    setUpdates(u);
    setMedia(m);
    if (p) {
      setEdit({
        forecastCompletionDate: p.forecastCompletionDate || "",
        contractCompletionDate: p.contractCompletionDate || "",
        status: p.status,
        forecastStatus: p.forecastStatus,
        internalNotes: p.internalNotes || "",
        allowStaffPublish: p.allowStaffPublish,
        allowClientDownload: p.allowClientDownload,
      });
    }
  }

  useEffect(() => {
    // Data load for project shell — async setState in .then/.finally
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on id change
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const summary = useMemo(() => summarizeSchedule(schedule), [schedule]);
  const mediaByUpdate = useMemo(() => {
    const map: Record<string, MediaItem[]> = {};
    media.forEach((item) => {
      if (!item.updateId) return;
      map[item.updateId] = map[item.updateId] || [];
      map[item.updateId].push(item);
    });
    return map;
  }, [media]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!project || profile?.role !== "admin") return;
    setSaving(true);
    try {
      setProject(await updateProject(project.id, edit));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SiteSpinner />;
  if (!project) {
    return <p style={{ color: "var(--site-text-secondary)" }}>Project not found.</p>;
  }

  return (
    <div>
      <ProjectChrome
        project={project}
        activeTab={tab}
        onTabChange={(next) => {
          if (next === "purchases") {
            router.push(`/projects/${project.id}/purchases`);
            return;
          }
          setTab(next);
        }}
        actions={
          <ProjectChromeActions
            projectId={project.id}
            onStages={() => setManageStagesOpen(true)}
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
                  src={getOverviewDisplayImage(project)}
                  alt={project.name}
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

          {/* 4. Project schedule — Timeline then Monthly calendar */}
          <div className="site-schedule-dates">
            <SiteField label="Project commence date">
              <SiteInput
                type="date"
                value={project.startDate || ""}
                onChange={async (e) => {
                  const startDate = e.target.value;
                  setProject(
                    await updateProject(project.id, { startDate }),
                  );
                }}
              />
            </SiteField>
            <SiteField label="Target handover date">
              <SiteInput
                type="date"
                value={project.contractCompletionDate || ""}
                onChange={async (e) => {
                  const contractCompletionDate = e.target.value;
                  setProject(
                    await updateProject(project.id, {
                      contractCompletionDate,
                      forecastCompletionDate:
                        project.forecastCompletionDate ||
                        contractCompletionDate,
                    }),
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
              editable
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
                stages={summary.ordered}
                editable
              />
            </div>
          </SiteSection>

          {/* 5. Stage snapshot */}
          <SiteSection
            title="Stage snapshot"
            description="Only stages chosen for this project."
            action={
              <SiteButton
                type="button"
                variant="ghost"
                onClick={() => setManageStagesOpen(true)}
              >
                Manage stages
              </SiteButton>
            }
          >
            {!schedule.length ? (
              <div className="site-empty">
                <strong>No stages added yet</strong>
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
                      padding: "12px 0",
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
                onClick={() => setTab("journal")}
              >
                Open journal
              </SiteButton>
            }
          >
            <ProgressMediaGrid
              items={media.slice(0, 8)}
              allowDownload
            />
          </SiteSection>

          {/* 7. 3D view */}
          <Overview3DPanel
            project={project}
            editable
            onUpdated={setProject}
          />
        </>
      ) : null}

      {tab === "journal" ? (
        <>
          <JournalComposer
            project={project}
            compact
            onPublished={async () => {
              await reload();
            }}
          />
          <ProgressTimeline
            groups={groupUpdatesByDate(updates)}
            mediaByUpdate={mediaByUpdate}
            allowDownload
          />
        </>
      ) : null}

      {tab === "media" ? <ProgressMediaGrid items={media} allowDownload /> : null}

      <ManageStagesDialog
        projectId={project.id}
        open={manageStagesOpen}
        onClose={() => setManageStagesOpen(false)}
        onChanged={setSchedule}
      />

      {tab === "settings" ? (
        <form onSubmit={saveSettings} style={{ maxWidth: 640 }}>
          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
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
                disabled={profile?.role !== "admin"}
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
            {profile?.role === "admin" && project.status !== "completed" ? (
              <SiteButton
                type="button"
                variant="ghost"
                onClick={async () => {
                  setProject(await markProjectCompleted(project.id));
                }}
              >
                Mark completed
              </SiteButton>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
